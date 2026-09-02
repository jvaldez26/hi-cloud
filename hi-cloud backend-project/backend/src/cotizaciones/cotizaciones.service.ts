import {
  Injectable, NotFoundException, BadRequestException, Logger,
  StreamableFile,
} from '@nestjs/common';
import { reportServiceError } from '../common/observability/sentry';
import type { DocumentoPDFData, DocumentoPDFItem } from '../common/pdf/documento-pdf.helper';
import { generarDocumentoPDFFactura } from '../common/pdf/documento-pdf.helper';
import { generarReciboPOSPDF } from '../common/pdf/factura-pdf.helper';
import type { ReciboPOSData } from '../facturas/templates/recibo-termico.template';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, LessThan, In, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { Cron } from '@nestjs/schedule';
import { Cotizacion, CotizacionEstado } from './entities/cotizacion.entity';
import { CotizacionDetalle } from './entities/cotizacion-detalle.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';
import { FacturasService } from '../facturas/facturas.service';
import { fechaYHoraRD } from '../common/utils/fecha-local.util';
import {
  calcularTotalesConDescuento,
  validarInvarianteConvencionB,
  type LineaDescuentoInput,
} from '../common/calculo/descuento-documento';

@Injectable()
export class CotizacionesService {
  private readonly logger = new Logger(CotizacionesService.name);

  constructor(
    @InjectRepository(Cotizacion)
    private cotizacionRepository: Repository<Cotizacion>,
    @InjectRepository(CotizacionDetalle)
    private detalleRepository:    Repository<CotizacionDetalle>,
    @InjectRepository(Factura)
    private facturaRepository:    Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private facturaDetalleRepository: Repository<FacturaDetalle>,
    private tenantService:    TenantService,
    private realtimeService:  RealtimeService,
    @InjectDataSource() private dataSource: DataSource,
    private facturasService:  FacturasService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource, 'cotizaciones', 'numero', '^COT-[0-9]+$', 'COT-', 1, empresaId,
    );
  }

  /**
   * Líneas y totales de una cotización — vía única, la comparten create() y
   * actualizar().
   *
   * Delega en `calcularTotalesConDescuento`, el mismo helper que usa
   * facturas.service. Ahí viven las dos convenciones de descuento por línea (A
   * del formulario, B del POS), el reparto proporcional del descuento general y
   * el ITBIS sobre la base ya descontada.
   *
   * Que sea el MISMO código y no uno equivalente es el punto entero: una
   * cotización se convierte en factura, y si cada uno calculara el dinero por su
   * cuenta el total cambiaría al convertirla.
   */
  private calcularDetalles(dto: Pick<CreateCotizacionDto,
    'detalles' | 'descuentoGeneralTipo' | 'descuentoGeneralValor'>) {
    const lineas: LineaDescuentoInput[] = dto.detalles!.map(item => {
      const linea: LineaDescuentoInput = {
        descripcion:    item.descripcion,
        cantidad:       item.cantidad,
        precioUnitario: Number(item.precioUnitario),
        precioOriginal: item.precioOriginal ?? null,
        descuentoPct:   Number(item.descuentoPct   ?? 0),
        descuentoMonto: Number(item.descuentoMonto ?? 0),
        porcentajeIva:  item.porcentajeIva ?? 18,
      };
      // Dentro del bucle, igual que en facturas.service: si dos líneas fallan,
      // el error que sale es el de la primera.
      validarInvarianteConvencionB(linea);
      return linea;
    });

    const totales = calcularTotalesConDescuento(lineas, {
      tipo:  dto.descuentoGeneralTipo,
      valor: dto.descuentoGeneralValor,
    });

    const detallesData: Partial<CotizacionDetalle>[] = dto.detalles!.map((item, i) => ({
      productoId:     item.productoId,
      descripcion:    item.descripcion,
      precioUnitario: item.precioUnitario,
      cantidad:       item.cantidad,
      porcentajeIva:  item.porcentajeIva ?? 18,
      descuentoPct:   Number(item.descuentoPct   ?? 0),
      descuentoMonto: Number(item.descuentoMonto ?? 0),
      precioOriginal: item.precioOriginal ?? undefined,
      subtotal:       totales.lineas[i].subtotal,
      importeIva:     totales.lineas[i].importeIva,
      total:          totales.lineas[i].total,
    }));

    return {
      detallesData,
      subtotal: totales.subtotal,
      iva:      totales.iva,
      total:    totales.total,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────

  async create(dto: CreateCotizacionDto, usuario: User) {
    const validez = dto.validezDias ?? 30;
    const fechaVencimiento = new Date(dto.fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + validez);

    // Descuentos e ITBIS: EXACTAMENTE el mismo cálculo que la factura. Si esto
    // se calculara aquí por su cuenta, el total cambiaría al convertir la
    // cotización en factura — ver common/calculo/descuento-documento.ts
    const { detallesData, subtotal, iva, total } = this.calcularDetalles(dto);

    const numero     = await this.generarNumero();
    const sucursalId = await this.tenantService.resolveSucursalId((dto as any).sucursalId);
    const cot = await this.cotizacionRepository.save(
      this.cotizacionRepository.create({
        numero,
        fecha:            new Date(dto.fecha),
        fechaVencimiento,
        validezDias:      validez,
        empresaId:        this.tenantService.getEmpresaId(),
        clienteId:        dto.clienteId,
        userId:           usuario.id,
        notas:            dto.notas,
        condicionesPago:  dto.condicionesPago,
        vendedorId:       (dto as any).vendedorId,
        nombreVendedor:   (dto as any).nombreVendedor,
        sucursalId,
        subtotal,
        iva,
        total,
        descuentoGeneralTipo:  dto.descuentoGeneralTipo ?? undefined,
        descuentoGeneralValor: Number(dto.descuentoGeneralValor ?? 0) > 0
          ? dto.descuentoGeneralValor
          : undefined,
        descuentoGeneralFinal: Number(dto.descuentoGeneralFinal ?? 0) > 0
          ? dto.descuentoGeneralFinal
          : undefined,
      }),
    );

    await this.detalleRepository.save(
      this.detalleRepository.create(detallesData.map(d => ({ ...d, cotizacionId: cot.id }))),
    );

    const empresaId = this.tenantService.getEmpresaId();
    this.realtimeService.notify(empresaId, 'cotizacion', 'created', cot.id);
    return this.findById(cot.id);
  }

  async findAll(pagination: PaginationDto) {
    const { limit = 10, page = 1, search } = pagination;
    const sucursalId = this.tenantService.getSucursalId();
    const qb = this.cotizacionRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .where('c.empresaId = :eid', { eid: this.tenantService.getEmpresaId() })
      .andWhere('c.isActive = :a', { a: true });

    if (sucursalId) qb.andWhere('(c.sucursalId = :sid OR c.sucursalId IS NULL)', { sid: sucursalId });

    if (search) qb.andWhere(
      '(c.numero ILIKE :s OR cliente.nombre ILIKE :s)', { s: `%${search}%` },
    );

    const [data, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.cotizacionRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'user', 'detalles', 'detalles.producto', 'factura'],
    });
    if (!c) throw new NotFoundException(`Cotización #${id} no encontrada`);
    return c;
  }

  async cambiarEstado(id: number, estado: CotizacionEstado) {
    const cot = await this.findById(id);
    const permitidos: Record<CotizacionEstado, CotizacionEstado[]> = {
      [CotizacionEstado.BORRADOR]:   [CotizacionEstado.ENVIADA, CotizacionEstado.RECHAZADA],
      [CotizacionEstado.ENVIADA]:    [CotizacionEstado.ACEPTADA, CotizacionEstado.RECHAZADA],
      [CotizacionEstado.ACEPTADA]:   [CotizacionEstado.CONVERTIDA],
      [CotizacionEstado.RECHAZADA]:  [],
      [CotizacionEstado.VENCIDA]:    [],
      [CotizacionEstado.CONVERTIDA]: [],
    };
    if (!permitidos[cot.estado].includes(estado)) {
      throw new BadRequestException(`No se puede pasar de "${cot.estado}" a "${estado}"`);
    }
    await this.cotizacionRepository.update(id, { estado });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'updated', id);
    return this.findById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Conversión a Factura — la función estrella
  // ──────────────────────────────────────────────────────────────────

  async convertirAFactura(id: number, usuario: User) {
    const cot = await this.findById(id);

    if (cot.estado !== CotizacionEstado.ACEPTADA) {
      throw new BadRequestException('Solo se pueden convertir cotizaciones ACEPTADAS');
    }
    if (cot.facturaId) {
      throw new BadRequestException(`Esta cotización ya fue convertida a la factura #${cot.facturaId}`);
    }

    // Generar folio de factura
    const count  = await this.facturaRepository.count();
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const folio  = `FAC-${y}${m}-${String(count + 1).padStart(4, '0')}`;

    // Crear factura — hereda sucursalId de la cotización (no del JWT activo)
    const factura = await this.facturaRepository.save(
      this.facturaRepository.create({
        empresaId:  this.tenantService.getEmpresaId(),
        folio,
        fecha:      now,
        estado:     FacturaEstado.BORRADOR,
        clienteId:  cot.clienteId,
        usuarioId:  usuario.id,
        notas:      cot.notas ?? `Convertida desde cotización ${cot.numero}`,
        subtotal:   Number(cot.subtotal),
        iva:        Number(cot.iva),
        total:      Number(cot.total),
        sucursalId: (cot as any).sucursalId ?? undefined,
        // El descuento viaja con el documento. Sin esto la factura saldría por
        // el subtotal ya rebajado pero sin decir por qué, y una nota de crédito
        // o una reimpresión no podrían reconstruir lo que se pactó.
        descuentoGeneralTipo:  cot.descuentoGeneralTipo  ?? undefined,
        descuentoGeneralValor: cot.descuentoGeneralValor ?? undefined,
        descuentoGeneralFinal: cot.descuentoGeneralFinal ?? undefined,
      }),
    );

    // Copiar detalles — importes incluidos, tal cual se aceptaron. No se
    // recalculan: la cotización ya los calculó con el mismo helper que la
    // factura, y recalcular aquí solo abriría la puerta a que difieran.
    await this.facturaDetalleRepository.save(
      this.facturaDetalleRepository.create(
        cot.detalles.map(d => ({
          facturaId:      factura.id,
          productoId:     d.productoId,
          descripcion:    d.descripcion,
          precioUnitario: Number(d.precioUnitario),
          cantidad:       d.cantidad,
          porcentajeIva:  Number(d.porcentajeIva),
          descuentoPct:   Number(d.descuentoPct   ?? 0),
          descuentoMonto: Number(d.descuentoMonto ?? 0),
          precioOriginal: d.precioOriginal ?? undefined,
          subtotal:       Number(d.subtotal),
          importeIva:     Number(d.importeIva),
          total:          Number(d.total),
        })),
      ),
    );

    // Marcar cotización como convertida
    await this.cotizacionRepository.update(id, {
      estado:    CotizacionEstado.CONVERTIDA,
      facturaId: factura.id,
    });

    this.logger.log(`Cotización ${cot.numero} convertida a factura ${folio}`);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'updated', id);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'factura',    'created');
    return this.findById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Cobrar desde POS — convierte cotización a factura PAGADA directo
  // Acepta BORRADOR y ENVIADA (no requiere estado ACEPTADA).
  // Sin vendedorId para saltarse el check de caja en cambiarEstado.
  // ──────────────────────────────────────────────────────────────────

  async cobrarDesdePos(id: number, usuarioId: number, dto: { metodoPago: string; diasCredito?: number }) {
    const empresaId = this.tenantService.getEmpresaId();
    const cot = await this.findById(id);

    if ([CotizacionEstado.CONVERTIDA, CotizacionEstado.RECHAZADA, CotizacionEstado.VENCIDA].includes(cot.estado)) {
      throw new BadRequestException('Esta cotización no puede cobrarse en su estado actual');
    }

    // Derivar vendedorId del CLS (JWT) — nunca del body.
    // Buscamos el vendedor cuyo usuarioId coincide con el cajero autenticado.
    const clsUserId = this.tenantService.getUserId();
    let cajaVendedorId: number | undefined;
    if (clsUserId) {
      const [v] = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM vendedores WHERE "usuarioId" = $1 AND "empresaId" = $2 AND "isActive" = true AND activo = true LIMIT 1`,
        [clsUserId, empresaId],
      );
      cajaVendedorId = v?.id;
    }

    // Folio atómico vía función de secuencia (nunca MAX+1)
    const [row] = await this.dataSource.query<{ numero: number }[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS numero`,
      [empresaId, 'FAC'],
    );
    const folio = `FAC-${row.numero}`;

    // Crear factura BORRADOR + marcar cotización CONVERTIDA (transacción atómica).
    const esCredito     = /cr[eé]dito/i.test(dto.metodoPago);
    const diasCred      = esCredito ? (dto.diasCredito ?? 30) : 0;
    const notasFactura  = esCredito ? `Crédito ${diasCred} días` : dto.metodoPago;
    const vencimiento   = esCredito
      ? (() => { const d = new Date(); d.setDate(d.getDate() + diasCred); return d; })()
      : undefined;

    const savedFactura = await this.dataSource.transaction(async (manager) => {
      const f = manager.create(Factura, {
        empresaId,
        folio,
        fecha:            new Date(),
        estado:           FacturaEstado.BORRADOR,
        clienteId:        cot.clienteId,
        usuarioId,
        vendedorId:       cajaVendedorId,
        sucursalId:       (cot as any).sucursalId ?? undefined,
        subtotal:         Number(cot.subtotal),
        iva:              Number(cot.iva),
        total:            Number(cot.total),
        tipoNcf:          'E32',
        tipoPago:         esCredito ? 'CREDITO' : 'CONTADO',
        notas:            notasFactura,
        diasCredito:      diasCred || undefined,
        fechaVencimiento: vencimiento,
        // Igual que en convertirAFactura(): el descuento acompaña al documento
        descuentoGeneralTipo:  cot.descuentoGeneralTipo  ?? undefined,
        descuentoGeneralValor: cot.descuentoGeneralValor ?? undefined,
        descuentoGeneralFinal: cot.descuentoGeneralFinal ?? undefined,
        detalles:   cot.detalles.map(det => ({
          productoId:     det.productoId,
          descripcion:    det.descripcion,
          cantidad:       Math.round(Number(det.cantidad)),
          precioUnitario: Number(det.precioUnitario),
          porcentajeIva:  Number(det.porcentajeIva),
          descuentoPct:   Number(det.descuentoPct   ?? 0),
          descuentoMonto: Number(det.descuentoMonto ?? 0),
          precioOriginal: det.precioOriginal ?? undefined,
          subtotal:       Number(det.subtotal),
          importeIva:     Number(det.importeIva),
          total:          Number(det.total),
        })) as any,
      });
      const saved = await manager.save(f);
      await manager.update(Cotizacion, id, {
        estado:    CotizacionEstado.CONVERTIDA,
        facturaId: saved.id,
      });
      return saved;
    });

    // Emitir: ECF + stock + asiento (BORRADOR → PAGADA para contado).
    // Si cambiarEstado lanza antes de actualizar el estado, propagar — no silenciar.
    // Si ECF falla en modoSincrono, cambiarEstado retorna { ecfEmitido: false, ecfError }.
    let emitResult: any;
    try {
      emitResult = await this.facturasService.cambiarEstado(
        savedFactura.id,
        FacturaEstado.EMITIDA,
        true,
      );
    } catch (err: any) {
      reportServiceError(err, 'cobrar_pos_cot_emision', {
        facturaId: savedFactura.id,
        empresaId,
        folio,
      });
      throw err;
    }

    this.realtimeService.notify(empresaId, 'cotizacion', 'updated', id);
    this.realtimeService.notify(empresaId, 'factura', 'created');
    const ecfEmitido = emitResult?.ecfEmitido !== false;
    const ecfError   = ecfEmitido ? undefined : (emitResult?.ecfError as string | undefined);
    return { facturaId: savedFactura.id, folio, ecfEmitido, ecfError };
  }

  async remove(id: number) {
    const cot = await this.findById(id);
    if (cot.estado !== CotizacionEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar cotizaciones en BORRADOR');
    }
    await this.cotizacionRepository.update(id, { isActive: false });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'deleted', id);
    return { message: `Cotización ${cot.numero} eliminada` };
  }

  async getResumen() {
    const rows = await this.cotizacionRepository
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .addSelect('COALESCE(SUM(c.total), 0)', 'montoTotal')
      .where('c.empresaId = :eid AND c.isActive = true', { eid: this.tenantService.getEmpresaId() })
      .groupBy('c.estado')
      .getRawMany();

    return rows.map(r => ({
      estado:     r.estado,
      cantidad:   Number(r.cantidad),
      montoTotal: Number(r.montoTotal),
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // PDF
  // ──────────────────────────────────────────────────────────────────

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const cot = await this.findById(id);

    const empresa = await this.cotizacionRepository.manager
      .query('SELECT * FROM empresa WHERE id = $1 LIMIT 1', [cot.empresaId])
      .then((r: any[]) => r[0] || {});

    // Descargar logo de la empresa
    let logoBuf: Buffer | undefined;
    if (empresa.logo) {
      try {
        const res = await fetch(empresa.logo, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) logoBuf = Buffer.from(await res.arrayBuffer());
      } catch { /* logo no disponible — se usan iniciales */ }
    }

    // Estado → color de badge
    const estadoColor =
      cot.estado === 'aceptada'   ? 'green'  :
      cot.estado === 'convertida' ? 'green'  :
      cot.estado === 'rechazada'  ? 'red'    :
      cot.estado === 'vencida'    ? 'red'    : 'orange';

    // Las filas se muestran POST descuento de línea pero PRE descuento general,
    // y el general aparece en su propia fila abajo — igual que en la factura
    // (facturas/services/pdf.service.ts). Si se mostraran ya netas del general,
    // restarlo otra vez en los totales descuadraría el papel.
    const lineasPdf: LineaDescuentoInput[] = (cot.detalles || []).map(d => ({
      descripcion:    d.descripcion,
      cantidad:       Number(d.cantidad),
      precioUnitario: Number(d.precioUnitario),
      precioOriginal: d.precioOriginal ?? null,
      descuentoPct:   Number(d.descuentoPct   ?? 0),
      descuentoMonto: Number(d.descuentoMonto ?? 0),
      porcentajeIva:  Number(d.porcentajeIva ?? 18),
    }));

    const preGeneral = calcularTotalesConDescuento(lineasPdf);
    const conGeneral = calcularTotalesConDescuento(lineasPdf, {
      tipo:  cot.descuentoGeneralTipo,
      valor: cot.descuentoGeneralValor,
    });

    const items: DocumentoPDFItem[] = (cot.detalles || []).map((d, i) => ({
      descripcion:    d.descripcion,
      cantidad:       Number(d.cantidad),
      unidadMedida:   (d as any).producto?.unidadMedida ?? 'UN',
      // Con descuento se enseña el precio de LISTA: el cliente tiene que ver de
      // cuánto se partía, no solo lo que acabó pagando
      precioUnitario: Number(d.precioUnitario),
      precioOriginal: d.precioOriginal != null ? Number(d.precioOriginal) : undefined,
      descuentoLinea: preGeneral.lineas[i].descuentoLinea,
      descuentoPct:   Number(d.descuentoPct ?? 0),
      itbisPct:       Number(d.porcentajeIva ?? 18),
      importeItbis:   preGeneral.lineas[i].importeIva,
      subtotal:       preGeneral.lineas[i].subtotal,
      total:          preGeneral.lineas[i].total,
    }));

    const subtotalGravado = items.filter(i => i.itbisPct > 0).reduce((s, i) => s + i.subtotal, 0);
    const subtotalExento  = items.filter(i => i.itbisPct === 0).reduce((s, i) => s + i.subtotal, 0);

    const factConf = (empresa.configuracion ?? {}) as Record<string, unknown>;

    const data: DocumentoPDFData = {
      tipo:              'COTIZACIÓN',
      tipoSub:           'Propuesta comercial · No válida como comprobante fiscal',
      numero:            cot.numero,
      fecha:             String(cot.fecha),
      fechaVencimiento:  cot.fechaVencimiento ? String(cot.fechaVencimiento) : undefined,
      validezDias:       cot.validezDias,
      condicionesPago:   cot.condicionesPago,
      estado:            cot.estado,
      estadoColor,
      empresaNombre:     empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
      empresaRNC:        empresa.rnc || '',
      empresaDireccion:  empresa.direccion || '',
      empresaCiudad:     empresa.ciudad,
      empresaTelefono:   factConf.factMostrarTelefono !== false ? empresa.telefono : undefined,
      empresaEmail:      factConf.factMostrarEmail    !== false ? empresa.email    : undefined,
      empresaSitioWeb:   factConf.factMostrarWeb      !== false ? empresa.sitioWeb : undefined,
      empresaPie:        empresa.configuracion?.pieFactura as string | undefined,
      vendedorNombre:    cot.nombreVendedor,
      sucursalNombre:    (cot as any).sucursalId
        ? await this.cotizacionRepository.manager.query(
            'SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1',
            [(cot as any).sucursalId],
          ).then((r: any[]) => r[0]?.nombre ?? undefined)
        : undefined,
      clienteNombre:     cot.cliente?.nombre || 'Consumidor Final',
      clienteRNC:        (cot.cliente as any)?.rncReceptor || (cot.cliente as any)?.rfc,
      clienteDireccion:  cot.cliente?.direccion,
      clienteCiudad:     cot.cliente?.ciudad,
      clienteTelefono:   cot.cliente?.telefono,
      clienteEmail:      cot.cliente?.email,
      items,
      subtotalGravado,
      subtotalExento,
      subtotalGeneral:   subtotalGravado + subtotalExento,
      // El descuento general, en su propia fila entre el subtotal y el ITBIS
      descuentoTotal:         conGeneral.descuentoGeneral,
      descuentoGeneralTipo:   cot.descuentoGeneralTipo,
      descuentoGeneralValor:  cot.descuentoGeneralValor != null ? Number(cot.descuentoGeneralValor) : undefined,
      descuentoGeneralFinal:  cot.descuentoGeneralFinal != null ? Number(cot.descuentoGeneralFinal) : undefined,
      itbisTotal:        Number(cot.iva ?? 0),
      totalGeneral:      Number(cot.total ?? 0),
      notas:             cot.notas ?? undefined,
      mostrarFirma:      true,  // Las cotizaciones siempre muestran sección de aceptación
    };

    const buffer = await generarDocumentoPDFFactura(data, logoBuf);
    return { buffer, filename: `${cot.numero}.pdf` };
  }

  async generarReciboTermico(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const cot = await this.findById(id);

    const empresa = await this.cotizacionRepository.manager
      .query('SELECT * FROM empresa WHERE id = $1 LIMIT 1', [cot.empresaId])
      .then((r: any[]) => r[0] || {});

    const sucursalNombre: string | undefined = (cot as any).sucursalId
      ? await this.cotizacionRepository.manager.query(
          'SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1',
          [(cot as any).sucursalId],
        ).then((r: any[]) => r[0]?.nombre ?? undefined)
      : undefined;

    const fechaHora = fechaYHoraRD();

    const data: ReciboPOSData & { validezDias?: number } = {
      empresaNombre:   empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
      empresaRNC:      empresa.rnc || '',
      empresaTelefono: empresa.telefono,
      empresaWeb:      empresa.sitioWeb,
      vendedor:        cot.nombreVendedor,
      sucursal:        sucursalNombre,
      fechaHora,
      numero:          cot.numero,
      metodoPago:      cot.condicionesPago ?? 'POR CONFIRMAR',
      validezDias:     cot.validezDias ?? 30,
      items: (cot.detalles || []).map(d => ({
        descripcion: d.descripcion,
        cantidad:    Number(d.cantidad),
        precio:      Number(d.precioUnitario),
        total:       Number(d.total ?? Number(d.precioUnitario) * Number(d.cantidad) * 1.18),
      })),
      subtotal: Number(cot.subtotal ?? 0),
      itbis:    Number(cot.iva      ?? 0),
      total:    Number(cot.total    ?? 0),
    };

    const buffer = await generarReciboPOSPDF(data, 'COTIZACIÓN');
    return { buffer, filename: `recibo-${cot.numero}.pdf` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron: marcar cotizaciones vencidas diariamente
  // ──────────────────────────────────────────────────────────────────

  // ── Duplicar cotización ───────────────────────────────────────────────────────

  async duplicar(id: number, userId: number) {
    const empresaId  = this.tenantService.getEmpresaId();
    const original   = await this.cotizacionRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['detalles'],
    });
    if (!original) throw new NotFoundException(`Cotización #${id} no encontrada`);

    const numero = await this.generarNumero();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);

    const nueva = await this.cotizacionRepository.save(
      this.cotizacionRepository.create({
        empresaId,
        numero,
        fecha:           new Date(),
        fechaVencimiento,
        estado:          CotizacionEstado.BORRADOR,
        clienteId:       original.clienteId,
        subtotal:        original.subtotal,
        iva:             original.iva,
        total:           original.total,
        notas:           original.notas,
        condicionesPago: original.condicionesPago,
        // Duplicar sin el descuento dejaría los totales copiados sin la razón
        // que los explica: el documento cuadraría solo por casualidad
        descuentoGeneralTipo:  original.descuentoGeneralTipo  ?? undefined,
        descuentoGeneralValor: original.descuentoGeneralValor ?? undefined,
        descuentoGeneralFinal: original.descuentoGeneralFinal ?? undefined,
        userId,
      } as any) as any,
    ) as unknown as Cotizacion;

    if (original.detalles?.length) {
      await this.detalleRepository.save(
        original.detalles.map(d => ({
          cotizacionId:  nueva.id,
          productoId:    d.productoId,
          descripcion:   d.descripcion,
          cantidad:      d.cantidad,
          precioUnitario:d.precioUnitario,
          porcentajeIva: d.porcentajeIva,
          descuentoPct:   Number(d.descuentoPct   ?? 0),
          descuentoMonto: Number(d.descuentoMonto ?? 0),
          precioOriginal: d.precioOriginal ?? undefined,
          importeIva:    d.importeIva,
          subtotal:      d.subtotal,
          total:         d.total,
        })) as any,
      );
    }

    this.realtimeService.notify(empresaId, 'cotizacion', 'created', nueva.id);

    return this.cotizacionRepository.findOne({
      where: { id: nueva.id },
      relations: ['cliente', 'detalles'],
    });
  }

  async actualizar(id: number, dto: Partial<CreateCotizacionDto>, usuario: User) {
    const empresaId = this.tenantService.getEmpresaId();
    const cot = await this.cotizacionRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['detalles'],
    });
    if (!cot) throw new NotFoundException(`Cotización #${id} no encontrada`);
    if (cot.estado !== CotizacionEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden editar cotizaciones en BORRADOR');
    }

    // Recalcular totales si vienen detalles nuevos
    if (dto.detalles?.length) {
      // Mismo cálculo que create() — y que la factura
      const { detallesData, subtotal, iva, total } = this.calcularDetalles({
        detalles:              dto.detalles,
        descuentoGeneralTipo:  dto.descuentoGeneralTipo,
        descuentoGeneralValor: dto.descuentoGeneralValor,
      });

      await this.detalleRepository.delete({ cotizacionId: id });
      await this.detalleRepository.save(
        detallesData.map(d => ({ ...d, cotizacionId: id })) as any,
      );
      await this.cotizacionRepository.update(id, {
        clienteId:    dto.clienteId    ?? cot.clienteId,
        subtotal,
        iva,
        total,
        // El descuento general se reemplaza por lo que venga en el DTO: si el
        // usuario lo quita al editar, tiene que desaparecer, no quedarse pegado.
        descuentoGeneralTipo:  dto.descuentoGeneralTipo ?? null,
        descuentoGeneralValor: Number(dto.descuentoGeneralValor ?? 0) > 0
          ? dto.descuentoGeneralValor
          : null,
        descuentoGeneralFinal: Number(dto.descuentoGeneralFinal ?? 0) > 0
          ? dto.descuentoGeneralFinal
          : null,
        notas:        dto.notas        ?? cot.notas,
        condicionesPago: dto.condicionesPago ?? cot.condicionesPago,
        ...(dto.fecha ? { fecha: new Date(dto.fecha), fechaVencimiento: (() => {
          const d = new Date(dto.fecha); d.setDate(d.getDate() + (dto.validezDias ?? 30)); return d;
        })() } : {}),
      } as any);
    } else {
      await this.cotizacionRepository.update(id, {
        clienteId:    dto.clienteId    ?? cot.clienteId,
        notas:        dto.notas        ?? cot.notas,
        condicionesPago: dto.condicionesPago ?? cot.condicionesPago,
        ...(dto.fecha ? { fecha: new Date(dto.fecha) } : {}),
      } as any);
    }

    this.realtimeService.notify(empresaId, 'cotizacion', 'updated', id);
    return this.cotizacionRepository.findOne({ where: { id }, relations: ['cliente', 'detalles'] });
  }

  @Cron('5 0 * * *')
  async marcarVencidas() {
    const res = await this.cotizacionRepository.update(
      {
        estado: In([CotizacionEstado.BORRADOR, CotizacionEstado.ENVIADA]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      { estado: CotizacionEstado.VENCIDA },
    );
    if ((res.affected ?? 0) > 0) {
      this.logger.log(`Cotizaciones vencidas marcadas: ${res.affected}`);
    }
  }
}
