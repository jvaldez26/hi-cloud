import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { Devolucion, EstadoDevolucion, TipoDevolucion } from './entities/devolucion.entity';
import { DevolucionDetalle } from './entities/devolucion-detalle.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { NotaCredito, EstadoNotaCredito, MotivoNotaCredito } from '../notas-credito/entities/nota-credito.entity';
import { NotaCreditoDetalle } from '../notas-credito/entities/nota-credito-detalle.entity';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { ProcesarDevolucionDto } from './dto/procesar-devolucion.dto';
import { InventarioService } from '../inventario/inventario.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { User } from '../users/users.entity';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { reportServiceError } from '../common/observability/sentry';

@Injectable()
export class DevolucionesService {
  private readonly logger = new Logger(DevolucionesService.name);

  constructor(
    @InjectRepository(Devolucion)        private devRepository:      Repository<Devolucion>,
    @InjectRepository(DevolucionDetalle) private detalleRepository:  Repository<DevolucionDetalle>,
    @InjectRepository(Factura)           private facturaRepository:  Repository<Factura>,
    @InjectRepository(NotaCredito)       private ncRepository:       Repository<NotaCredito>,
    @InjectRepository(NotaCreditoDetalle) private ncDetRepository:   Repository<NotaCreditoDetalle>,
    private inventarioService: InventarioService,
    private asientosService:   AsientosAutomaticosService,
    private tenantService:     TenantService,
    @InjectDataSource() private ds: DataSource,
  ) {}

  // ─── Folios ───────────────────────────────────────────────────────────────────

  /**
   * `empresaId` explícito por defecto sale de TenantService (todo caller
   * normal, dentro de un request HTTP). crearDesdeNotaCredito() lo pasa a
   * mano: corre fire-and-forget desde ecf-efectos-nc.service.ts, que puede
   * disparar desde el cron de consulta de estado DGII — sin CLS, sin
   * contexto de tenant, TenantService.getEmpresaId() ahí lanzaría.
   */
  private async generarNumero(empresaId: number = this.tenantService.getEmpresaId()): Promise<string> {
    return generarNumeroSecuencial(
      this.ds, 'devoluciones', 'numero', '^DEV-[0-9]+$', 'DEV-', 1, empresaId,
    );
  }

  private async generarNumeroNC(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.ds, 'notas_credito', 'numero', '^NC-[0-9]+$', 'NC-', 1, empresaId,
    );
  }

  // ─── Crear devolución ─────────────────────────────────────────────────────────

  async create(dto: CreateDevolucionDto, usuario: User) {
    const factura = await this.facturaRepository.findOne({
      where: { id: dto.facturaId, isActive: true },
      relations: ['cliente'],
    });
    if (!factura) throw new NotFoundException(`Factura #${dto.facturaId} no encontrada`);

    if (!['emitida', 'pagada'].includes(factura.estado)) {
      throw new BadRequestException('Solo se pueden devolver facturas emitidas o pagadas');
    }

    const detallesData: Partial<DevolucionDetalle>[] = [];
    let subtotal = 0, iva = 0;

    for (const item of dto.detalles) {
      const pIva   = item.porcentajeIva ?? 18;
      const sub    = Number(item.precioUnitario) * item.cantidad;
      const impIva = Number((sub * pIva / 100).toFixed(2));
      subtotal += sub; iva += impIva;

      detallesData.push({
        productoId:     item.productoId,
        descripcion:    item.descripcion,
        precioUnitario: item.precioUnitario,
        cantidad:       item.cantidad,
        porcentajeIva:  pIva,
        subtotal:       sub,
        importeIva:     impIva,
        total:          sub + impIva,
      });
    }

    const numero = await this.generarNumero();
    const dev = await this.devRepository.save(
      this.devRepository.create({
        empresaId: this.tenantService.getEmpresaId(),
        numero,
        fecha:     new Date(dto.fecha),
        tipo:      dto.tipo,
        facturaId: dto.facturaId,
        clienteId: factura.clienteId,
        motivo:    dto.motivo,
        userId:    usuario.id,
        subtotal:  Number(subtotal.toFixed(2)),
        iva:       Number(iva.toFixed(2)),
        total:     Number((subtotal + iva).toFixed(2)),
      }),
    );

    await this.detalleRepository.save(
      this.detalleRepository.create(detallesData.map(d => ({ ...d, devolucionId: dev.id }))),
    );

    return this.findById(dev.id);
  }

  // ─── Generada automáticamente desde una NC aceptada por DGII ─────────────────

  /**
   * Crea una devolución ya PROCESADA a partir de una NC de código 1 o 3
   * aceptada por DGII, moviendo el inventario de una vez con las cantidades
   * exactas de la NC — llamada únicamente desde ecf-efectos-nc.service.ts,
   * fire-and-forget, después de que esa NC ya aplicó sus propios efectos.
   * Decisión explícita: se confía en el monto de la NC, nadie elige almacén
   * ni ajusta cantidades — revierte la decisión original de "alguien tiene
   * que recibir físicamente la mercancía primero" (pasaba por PENDIENTE).
   *
   * Ese servicio corre también desde el cron de consulta de estado (sin
   * contexto de tenant), así que este método NUNCA usa TenantService
   * directo: `empresaId` llega explícito en `payload`, y el movimiento de
   * inventario se envuelve en `tenantService.runForEmpresa()` porque
   * InventarioService.obtenerProducto() sí depende internamente de
   * TenantService.getEmpresaId() sin forma de recibirlo explícito.
   *
   * No genera asiento propio ni una segunda NC — los de la NC ya existen
   * (ecf-efectos-nc.service.ts los generó al aceptar DGII); repetirlos
   * aquí duplicaría la reversa contable. Mismo guard que procesar() aplica
   * para las devoluciones "pendiente" históricas creadas antes de este
   * cambio (ver notaCreditoId ya asignado desde la creación, ahí abajo).
   *
   * Devuelve null (nunca lanza) cuando no hay nada que crear:
   *   - ya existe una devolución para esta NC (reintento del cron o carrera
   *     webhook+cron — notaCreditoId es la idempotencia);
   *   - ninguna línea de la NC tiene productoId identificable (ajuste de
   *     monto puro — no hay mercancía que recibir). Se reporta a Sentry como
   *     caso a revisar, no como error: la NC se procesó bien, solo no hay
   *     nada físico que devolver.
   */
  async crearDesdeNotaCredito(payload: {
    empresaId:          number;
    ncId:               number;
    ncNumero:           string;
    facturaOriginalId:  number;
    clienteId:          number;
    usuarioId:          number;
    codigoModificacion: 1 | 3;
  }): Promise<Devolucion | null> {
    const { empresaId, ncId, ncNumero, facturaOriginalId, clienteId, usuarioId, codigoModificacion } = payload;

    const yaExiste = await this.devRepository.findOne({
      where: { notaCreditoId: ncId, isActive: true } as any,
    });
    if (yaExiste) return null;

    const detallesNc = await this.ds.query<{
      productoId: number | null; descripcion: string; cantidad: string;
      precioUnitario: string; porcentajeIva: string; subtotal: string; iva: string; total: string;
    }[]>(
      `SELECT "productoId", descripcion, cantidad, "precioUnitario",
              "porcentajeIva", subtotal, iva, total
       FROM nota_credito_detalles WHERE "notaCreditoId" = $1 ORDER BY id`,
      [ncId],
    );

    // Solo líneas con producto identificable — un ajuste de monto sin
    // productoId (33 líneas históricas conocidas, código 1 con tasas
    // promediadas) no describe ninguna mercancía física que recibir.
    const conProducto = detallesNc.filter(d => d.productoId != null);
    if (conProducto.length === 0) {
      const msg = `NC ${ncNumero} (código ${codigoModificacion}) aceptada sin productoId en ninguna línea — no se genera devolución`;
      this.logger.warn(`[Devoluciones] ${msg}`);
      reportServiceError(new Error(msg), 'devolucion_desde_nc_sin_producto', {
        ncId: String(ncId), empresaId: String(empresaId), codigoModificacion: String(codigoModificacion),
      });
      return null;
    }

    const detallesData = conProducto.map(d => ({
      productoId:     d.productoId as number,
      descripcion:    d.descripcion,
      precioUnitario: Number(d.precioUnitario),
      cantidad:       Number(d.cantidad),
      porcentajeIva:  Number(d.porcentajeIva ?? 18),
      subtotal:       Number(d.subtotal),
      importeIva:     Number(d.iva ?? 0),
      total:          Number(d.total),
    }));
    const subtotal = detallesData.reduce((s, d) => s + d.subtotal, 0);
    const iva      = detallesData.reduce((s, d) => s + d.importeIva, 0);

    const numero = await this.generarNumero(empresaId);

    const dev = await this.devRepository.save(this.devRepository.create({
      empresaId,
      numero,
      fecha:      fechaHoyRD() as unknown as Date,
      // Código 1 (anulación total) nace con TODAS las líneas de la factura —
      // TOTAL. Código 3 nace solo con lo que la NC afecta — PARCIAL, aunque
      // por casualidad cubra el monto completo de alguna línea.
      tipo:       codigoModificacion === 1 ? TipoDevolucion.TOTAL : TipoDevolucion.PARCIAL,
      estado:     EstadoDevolucion.PROCESADA,
      facturaId:  facturaOriginalId,
      clienteId,
      motivo:     `Generada y procesada automáticamente al aceptar DGII la NC ${ncNumero} (código ${codigoModificacion})`,
      userId:     usuarioId,
      generadaDesdeNc: true,
      subtotal:   +subtotal.toFixed(2),
      iva:        +iva.toFixed(2),
      total:      +(subtotal + iva).toFixed(2),
      notaCreditoId:     ncId,
      notaCreditoNumero: ncNumero,
    }));

    await this.detalleRepository.save(
      this.detalleRepository.create(detallesData.map(d => ({ ...d, devolucionId: dev.id }))),
    );

    // Mueve el inventario de una vez, al almacén por defecto de la empresa
    // (sin almacenId explícito — cae al fallback de syncStockAlmacen, el
    // mismo que anular() usará simétricamente si algún día hay que
    // revertir esto). runForEmpresa() crea el contexto CLS que este método
    // deliberadamente no tiene (ver comentario de la función).
    await this.tenantService.runForEmpresa(empresaId, async () => {
      for (const d of detallesData) {
        await this.inventarioService.registrarDevolucion(
          d.productoId, d.cantidad, usuarioId,
          `Devolución ${numero} — generada automáticamente al aceptar DGII la NC ${ncNumero}`,
          numero,
        );
      }
    });

    // Vínculo simétrico en la NC — para mostrar "Devolución relacionada" en
    // su detalle sin un JOIN.
    await this.ncRepository.update(
      { id: ncId, empresaId } as any,
      { devolucionId: dev.id, devolucionNumero: numero } as any,
    );

    this.logger.log(`[Devoluciones] ${numero} generada y procesada automáticamente desde NC ${ncNumero} — inventario movido`);
    return dev;
  }

  // ─── Listar ───────────────────────────────────────────────────────────────────

  async findAll(pagination: PaginationDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.devRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.cliente', 'cliente')
      .leftJoinAndSelect('d.factura', 'factura')
      .where('d.isActive = :a', { a: true })
      .andWhere('d.empresaId = :eid', { eid: empresaId });

    if (search) qb.andWhere(
      '(d.numero ILIKE :s OR cliente.nombre ILIKE :s OR factura.folio ILIKE :s)',
      { s: `%${search}%` },
    );

    const [data, total] = await qb
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const d = await this.devRepository.findOne({
      where: { id, isActive: true, empresaId } as any,
      relations: ['cliente', 'factura', 'detalles', 'detalles.producto', 'user'],
    });
    if (!d) throw new NotFoundException(`Devolución #${id} no encontrada`);
    return d;
  }

  // ─── Procesar + generar Nota de Crédito E34 ──────────────────────────────────

  async procesar(id: number, usuario: User, dto?: ProcesarDevolucionDto) {
    const dev = await this.findById(id);

    if (dev.estado !== EstadoDevolucion.PENDIENTE) {
      throw new BadRequestException(`La devolución está "${dev.estado}" — ya fue procesada o anulada`);
    }

    // Cantidades ajustables por línea — el cliente devolvió menos de lo que
    // la devolución solicitaba. Sin ajuste, se procesa la línea completa.
    const cantidadAjustada = new Map<number, number>();
    for (const a of dto?.detalles ?? []) cantidadAjustada.set(a.detalleId, a.cantidad);

    // 1. Devolver inventario — al almacén que el usuario elige al confirmar
    //    la recepción. Siempre, sea cual sea el origen de la devolución.
    for (const detalle of dev.detalles) {
      if (!detalle.productoId) continue;
      const cantidad = cantidadAjustada.get(detalle.id) ?? Number(detalle.cantidad);
      if (cantidad <= 0) continue;
      await this.inventarioService.registrarDevolucion(
        detalle.productoId,
        cantidad,
        usuario.id,
        `Devolución ${dev.numero} — ${dev.motivo}`,
        dev.numero,
        dto?.almacenId,
      );
    }

    // Guard bidireccional (decisión #4/#5): esta devolución NACIÓ de una NC
    // — notaCreditoId ya viene asignado desde crearDesdeNotaCredito(), antes
    // de procesar cualquier cosa. Su NC y el asiento de esa NC ya existen
    // (ecf-efectos-nc.service.ts los generó al aceptar DGII); repetirlos
    // aquí duplicaría la reversa contable y crearía una NC fantasma sin
    // factura real que la respalde. Solo queda marcarla procesada.
    if (dev.notaCreditoId) {
      await this.devRepository.update(id, {
        estado: EstadoDevolucion.PROCESADA,
        almacenId: dto?.almacenId,
      });
      this.logger.log(
        `Devolución ${dev.numero} procesada (nacida de NC ${dev.notaCreditoNumero} — sin asiento ni NC propios)`,
      );
      return this.findById(id);
    }

    // 2. Asiento contable de reversa (solo cuando esta devolución generó
    //    todo desde cero — creada manualmente, no desde una NC)
    await this.asientosService.asientoDevolucionVenta(
      dev.id,
      Number(dev.total),
      Number(dev.subtotal),
      Number(dev.iva),
      dev.numero,
      usuario.id,
    );

    // 3. ── Generar Nota de Crédito E34 automáticamente ──────────────────────────
    const ncNumero = await this.generarNumeroNC();

    const nc = await this.ncRepository.save(
      this.ncRepository.create({
        empresaId:            this.tenantService.getEmpresaId(),
        numero:               ncNumero,
        fecha:                new Date() as unknown as Date,
        tipoNcf:              'E34',
        facturaOriginalId:    dev.facturaId,
        facturaOriginalFolio: (dev.factura as any)?.folio,
        clienteId:            dev.clienteId,
        usuarioId:            usuario.id,
        motivo:               MotivoNotaCredito.DEVOLUCION,
        descripcionMotivo:    `Devolución ${dev.numero}: ${dev.motivo}`,
        subtotal:             Number(dev.subtotal),
        iva:                  Number(dev.iva),
        total:                Number(dev.total),
        estado:               EstadoNotaCredito.EMITIDA,
        // Vínculo simétrico — devoluciones."notaCreditoId" ya apunta a esta
        // NC (se asigna más abajo); esto permite mostrar "Devolución
        // relacionada" en el detalle de la NC sin un JOIN.
        devolucionId:         dev.id,
        devolucionNumero:     dev.numero,
      }),
    );

    // Detalles de la NC copiados de la devolución
    const ncDetalles = dev.detalles.map(det => ({
      notaCreditoId:  nc.id,
      productoId:     det.productoId,
      descripcion:    det.descripcion,
      unidadMedida:   'PZA',
      cantidad:       Number(det.cantidad),
      precioUnitario: Number(det.precioUnitario),
      porcentajeIva:  Number(det.porcentajeIva ?? 18),
      subtotal:       Number(det.subtotal),
      iva:            Number(det.importeIva ?? 0),
      total:          Number(det.total),
    }));
    await this.ncDetRepository.save(this.ncDetRepository.create(ncDetalles));

    // 4. Marcar devolución como procesada con referencia a la NC
    await this.devRepository.update(id, {
      estado:            EstadoDevolucion.PROCESADA,
      notaCreditoId:     nc.id,
      notaCreditoNumero: ncNumero,
      almacenId:         dto?.almacenId,
    });

    this.logger.log(`Devolución ${dev.numero} procesada → Nota de Crédito E34 ${ncNumero} generada automáticamente`);
    return this.findById(id);
  }

  // ─── Anular ───────────────────────────────────────────────────────────────────

  async anular(id: number, usuario: User) {
    const dev = await this.findById(id);

    if (dev.estado === EstadoDevolucion.ANULADA) {
      throw new BadRequestException('Esta devolución ya está anulada');
    }

    // Una devolución "procesada" ya movió inventario (entrada al almacenId
    // guardado por procesar() — ver Devolucion.almacenId). Anularla implica
    // revertir esa entrada con una salida simétrica, mismo producto/
    // cantidad/almacén, ANTES de marcarla anulada. Si algún producto no
    // tiene stock suficiente (se vendió de nuevo después de la devolución),
    // registrarSalida lanza 400 y la anulación completa se aborta — no
    // queremos una devolución a medio anular con solo parte del stock
    // revertido.
    if (dev.estado === EstadoDevolucion.PROCESADA) {
      for (const detalle of dev.detalles) {
        if (!detalle.productoId) continue;
        const cantidad = Number(detalle.cantidad);
        if (cantidad <= 0) continue;
        await this.inventarioService.registrarSalida(
          detalle.productoId,
          cantidad,
          usuario.id,
          `Anulación de devolución ${dev.numero} — reversa de inventario`,
          dev.numero,
          dev.almacenId,
        );
      }
      this.logger.log(`Devolución ${dev.numero} (procesada) anulada — inventario revertido`);
    }

    await this.devRepository.update(id, { estado: EstadoDevolucion.ANULADA });
    return this.findById(id);
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────────

  async getResumen() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.devRepository
      .createQueryBuilder('d')
      .select('d.estado', 'estado')
      .addSelect('COUNT(d.id)', 'cantidad')
      .addSelect('COALESCE(SUM(d.total), 0)', 'montoTotal')
      .where('d.isActive = true')
      .andWhere('d.empresaId = :eid', { eid: empresaId })
      .groupBy('d.estado')
      .getRawMany();
  }
}
