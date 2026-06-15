import {
  Injectable, NotFoundException, BadRequestException, Logger,
  StreamableFile,
} from '@nestjs/common';
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

  // ──────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────

  async create(dto: CreateCotizacionDto, usuario: User) {
    const validez = dto.validezDias ?? 30;
    const fechaVencimiento = new Date(dto.fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + validez);

    const detallesData: Partial<CotizacionDetalle>[] = [];
    let subtotal = 0, iva = 0;

    for (const item of dto.detalles) {
      const pIva   = item.porcentajeIva ?? 18;
      const sub    = Number(item.precioUnitario) * item.cantidad;
      const impIva = Number((sub * pIva / 100).toFixed(2));
      const total  = sub + impIva;
      subtotal += sub; iva += impIva;

      detallesData.push({
        productoId:     item.productoId,
        descripcion:    item.descripcion,
        precioUnitario: item.precioUnitario,
        cantidad:       item.cantidad,
        porcentajeIva:  pIva,
        subtotal:       sub,
        importeIva:     impIva,
        total,
      });
    }

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
        subtotal:         Number(subtotal.toFixed(2)),
        iva:              Number(iva.toFixed(2)),
        total:            Number((subtotal + iva).toFixed(2)),
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
      }),
    );

    // Copiar detalles
    await this.facturaDetalleRepository.save(
      this.facturaDetalleRepository.create(
        cot.detalles.map(d => ({
          facturaId:      factura.id,
          productoId:     d.productoId,
          descripcion:    d.descripcion,
          precioUnitario: Number(d.precioUnitario),
          cantidad:       d.cantidad,
          porcentajeIva:  Number(d.porcentajeIva),
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

    // Calcular subtotales gravado/exento
    const items: DocumentoPDFItem[] = (cot.detalles || []).map(d => {
      const itbisPct   = Number((d as any).porcentajeIva ?? 18);
      const subtotal   = Number(d.precioUnitario) * Number(d.cantidad);
      const importeItbis = Number((d as any).importeIva ?? subtotal * (itbisPct / 100));
      return {
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        unidadMedida:   (d as any).producto?.unidadMedida ?? 'UN',
        precioUnitario: Number(d.precioUnitario),
        itbisPct,
        importeItbis,
        subtotal,
        total:          Number(d.total ?? subtotal + importeItbis),
      };
    });

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
      empresaNombre:     empresa.razonSocial || empresa.nombre || 'Mi Empresa',
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

    const now = new Date();
    const fechaHora = now.toLocaleDateString('es-DO') + ' ' +
      now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

    const data: ReciboPOSData & { validezDias?: number } = {
      empresaNombre:   empresa.razonSocial || empresa.nombre || 'Mi Empresa',
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
      let subtotal = 0, iva = 0;
      const detallesNuevos: Partial<CotizacionDetalle>[] = dto.detalles.map(item => {
        const pIva   = item.porcentajeIva ?? 18;
        const sub    = Number(item.precioUnitario) * item.cantidad;
        const impIva = Number((sub * pIva / 100).toFixed(2));
        subtotal += sub; iva += impIva;
        return { productoId: item.productoId, descripcion: item.descripcion,
          precioUnitario: item.precioUnitario, cantidad: item.cantidad,
          porcentajeIva: pIva, subtotal: sub, importeIva: impIva, total: sub + impIva };
      });

      await this.detalleRepository.delete({ cotizacionId: id });
      await this.detalleRepository.save(
        detallesNuevos.map(d => ({ ...d, cotizacionId: id })) as any,
      );
      await this.cotizacionRepository.update(id, {
        clienteId:    dto.clienteId    ?? cot.clienteId,
        subtotal:     Number(subtotal.toFixed(2)),
        iva:          Number(iva.toFixed(2)),
        total:        Number((subtotal + iva).toFixed(2)),
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
