import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Movimiento, TipoMovimiento } from './entities/movimiento.entity';
import { LoteProducto, EstadoLote } from './entities/lote-producto.entity';
import { SerialProducto, EstadoSerial } from './entities/serial-producto.entity';
import { Producto } from '../productos/entities/producto.entity';
import { SolicitudAjuste, EstadoSolicitudAjuste } from './entities/solicitud-ajuste.entity';
import { RegistrarEntradaDto } from './dto/registrar-entrada.dto';
import { RegistrarSalidaDto } from './dto/registrar-salida.dto';
import { RegistrarAjusteDto } from './dto/registrar-ajuste.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { EmailService } from '../notificaciones/services/email.service';

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(
    @InjectRepository(Movimiento)
    private movimientoRepository: Repository<Movimiento>,
    @InjectRepository(Producto)
    private productoRepository: Repository<Producto>,
    @InjectRepository(LoteProducto)
    private loteRepository: Repository<LoteProducto>,
    @InjectRepository(SerialProducto)
    private serialRepository: Repository<SerialProducto>,
    @InjectRepository(SolicitudAjuste)
    private solicitudAjusteRepository: Repository<SolicitudAjuste>,
    @InjectDataSource() private ds: DataSource,
    private realtimeService: RealtimeService,
    private tenantService: TenantService,
    private emailService: EmailService,
  ) {}

  /**
   * Sincroniza stock_almacen con el nuevo stock del producto.
   * Si targetAlmacenId se provee, actualiza ese almacén específico.
   * Si no, asigna al almacén principal de la empresa (el de menor id).
   * No lanza error si no hay almacenes — el stock global sigue funcionando.
   */
  private async syncStockAlmacen(
    empresaId: number,
    productoId: number,
    nuevoStock: number,
    stockMinimo: number,
    targetAlmacenId?: number,
  ) {
    const stockSafe = Math.max(0, nuevoStock);
    const minSafe   = stockMinimo ?? 0;

    if (targetAlmacenId) {
      await this.ds.query(`
        INSERT INTO stock_almacen (
          "empresaId", "almacenId", "productoId", stock, "stockMinimo", "isActive", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
        ON CONFLICT ("almacenId", "productoId") DO UPDATE SET
          stock        = EXCLUDED.stock,
          "stockMinimo"= EXCLUDED."stockMinimo",
          "updatedAt"  = NOW()
      `, [empresaId, targetAlmacenId, productoId, stockSafe, minSafe]).catch(() => {});
    } else {
      await this.ds.query(`
        INSERT INTO stock_almacen (
          "empresaId", "almacenId", "productoId", stock, "stockMinimo", "isActive", "createdAt", "updatedAt"
        )
        SELECT $1, a.id, $2, $3, $4, true, NOW(), NOW()
        FROM almacenes a
        WHERE a."empresaId" = $1
          AND a."isActive"  = true
          AND a.activo      = true
        ORDER BY a.id ASC
        LIMIT 1
        ON CONFLICT ("almacenId", "productoId") DO UPDATE SET
          stock        = EXCLUDED.stock,
          "stockMinimo"= EXCLUDED."stockMinimo",
          "updatedAt"  = NOW()
      `, [empresaId, productoId, stockSafe, minSafe]).catch(() => {
        // No bloquear el movimiento si la tabla stock_almacen no existe aún
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // Helpers internos
  // ──────────────────────────────────────────────────────────

  private async obtenerProducto(productoId: number): Promise<Producto> {
    const producto = await this.productoRepository.findOne({
      where: { id: productoId, empresaId: this.tenantService.getEmpresaId(), isActive: true },
    });
    if (!producto) throw new NotFoundException(`Producto #${productoId} no encontrado`);
    return producto;
  }

  private async persistirMovimiento(
    tipo: TipoMovimiento,
    productoId: number,
    cantidad: number,
    cantidadAnterior: number,
    cantidadNueva: number,
    userId: number,
    motivo?: string,
    referencia?: string,
    empresaId?: number,
    almacenId?: number,
  ): Promise<Movimiento> {
    const movimiento = this.movimientoRepository.create({
      tipo, productoId, cantidad, cantidadAnterior, cantidadNueva,
      motivo, referencia, userId,
      ...(empresaId ? { empresaId } : {}),
      ...(almacenId ? { almacenId } : {}),
    });
    return this.movimientoRepository.save(movimiento);
  }

  // ──────────────────────────────────────────────────────────
  // Operaciones básicas de inventario
  // ──────────────────────────────────────────────────────────

  async registrarEntrada(productoId: number, cantidad: number, userId: number, motivo?: string, referencia?: string, almacenId?: number) {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const cantidadNueva = Number((cantidadAnterior + cantidad).toFixed(4));

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) {
      this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);
      await this.syncStockAlmacen(producto.empresaId, productoId, cantidadNueva, Number(producto.stockMinimo), almacenId);
    }

    return this.persistirMovimiento(TipoMovimiento.ENTRADA, productoId, cantidad, cantidadAnterior, cantidadNueva, userId, motivo, referencia, producto.empresaId, almacenId);
  }

  async registrarSalida(productoId: number, cantidad: number, userId: number, motivo?: string, referencia?: string, almacenId?: number) {
    const producto = await this.obtenerProducto(productoId);

    // Los servicios no tienen inventario físico — omitir movimiento de stock
    if ((producto as any).tipo === 'servicio') return null;

    const cantidadAnterior = Number(producto.stock);

    if (cantidadAnterior < cantidad) {
      throw new BadRequestException(
        `Stock insuficiente para "${producto.nombre}". Disponible: ${cantidadAnterior}, requerido: ${cantidad}`,
      );
    }

    const cantidadNueva = Number((cantidadAnterior - cantidad).toFixed(4));
    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) {
      this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);
      await this.syncStockAlmacen(producto.empresaId, productoId, cantidadNueva, Number(producto.stockMinimo), almacenId);
    }

    return this.persistirMovimiento(TipoMovimiento.SALIDA, productoId, cantidad, cantidadAnterior, cantidadNueva, userId, motivo, referencia, producto.empresaId, almacenId);
  }

  async registrarDevolucion(productoId: number, cantidad: number, userId: number, motivo?: string, referencia?: string, almacenId?: number) {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const cantidadNueva = Number((cantidadAnterior + cantidad).toFixed(4));

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) {
      this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);
      await this.syncStockAlmacen(producto.empresaId, productoId, cantidadNueva, Number(producto.stockMinimo), almacenId);
    }

    return this.persistirMovimiento(TipoMovimiento.DEVOLUCION, productoId, cantidad, cantidadAnterior, cantidadNueva, userId, motivo, referencia, producto.empresaId, almacenId);
  }

  async registrarAjuste(productoId: number, cantidadNueva: number, userId: number, motivo: string) {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const diferencia = Math.abs(cantidadNueva - cantidadAnterior);

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) {
      await this.syncStockAlmacen(producto.empresaId, productoId, cantidadNueva, Number(producto.stockMinimo));
    }
    return this.persistirMovimiento(TipoMovimiento.AJUSTE, productoId, diferencia, cantidadAnterior, cantidadNueva, userId, motivo);
  }

  // ──────────────────────────────────────────────────────────
  // Consultas de movimientos
  // ──────────────────────────────────────────────────────────

  async getMovimientos(pagination: PaginationDto & { tipo?: string; desde?: string; hasta?: string }) {
    const empresaId = this.tenantService.getEmpresaId();
    const almacenId = this.tenantService.getAlmacenId();
    const { limit = 10, page = 1, search, tipo, desde, hasta } = pagination;

    const qb = this.movimientoRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.producto', 'producto')
      .leftJoinAndSelect('m.user', 'usuario')
      .where('m.empresaId = :eid', { eid: empresaId })
      .andWhere('m.isActive = :active', { active: true });

    // H1: filtrar por almacén del JWT cuando el usuario tiene almacén asignado
    if (almacenId) qb.andWhere('(m.almacenId = :aid OR m.almacenId IS NULL)', { aid: almacenId });

    if (search) qb.andWhere('(producto.nombre ILIKE :s OR producto.codigo ILIKE :s OR m.referencia ILIKE :s OR m.motivo ILIKE :s)', { s: `%${search}%` });
    if (tipo)  qb.andWhere('m.tipo = :tipo', { tipo });
    if (desde) qb.andWhere('m.createdAt >= :desde', { desde });
    // ISO 8601 (del month-picker con TZ RD) se usa directo; fecha simple YYYY-MM-DD añade hora fin de día
    if (hasta) qb.andWhere('m.createdAt <= :hasta', { hasta: hasta.includes('T') ? hasta : `${hasta} 23:59:59` });

    const [data, total] = await qb
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getMovimientosPorProducto(productoId: number, pagination: PaginationDto) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.obtenerProducto(productoId);
    const { limit = 20, page = 1 } = pagination;
    const [data, total] = await this.movimientoRepository.findAndCount({
      where: { productoId, empresaId, isActive: true },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getStockBajo() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.productoRepository
      .createQueryBuilder('p')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('p.isActive = :active', { active: true })
      .andWhere('p.stock <= p.stockMinimo')
      .orderBy('p.stock', 'ASC')
      .take(200)
      .getMany();
  }

  // ──────────────────────────────────────────────────────────
  // DTOs wrapper
  // ──────────────────────────────────────────────────────────

  async registrarEntradaDesdeDto(dto: RegistrarEntradaDto, userId: number) {
    const almacenId = dto.almacenId ?? this.tenantService.getAlmacenId() ?? undefined;
    return this.registrarEntrada(dto.productoId, dto.cantidad, userId, dto.motivo, dto.referencia, almacenId);
  }
  async registrarSalidaDesdeDto(dto: RegistrarSalidaDto, userId: number) {
    const almacenId = dto.almacenId ?? this.tenantService.getAlmacenId() ?? undefined;
    return this.registrarSalida(dto.productoId, dto.cantidad, userId, dto.motivo, dto.referencia, almacenId);
  }
  async registrarAjusteDesdeDto(dto: RegistrarAjusteDto, userId: number) {
    return this.registrarAjuste(dto.productoId, dto.cantidadNueva, userId, dto.motivo);
  }

  // ──────────────────────────────────────────────────────────
  // Lotes / Batches
  // ──────────────────────────────────────────────────────────

  async crearLote(dto: {
    productoId: number;
    numeroLote: string;
    cantidad: number;
    fechaVencimiento?: string;
    fechaFabricacion?: string;
    costoUnitario?: number;
    almacenId?: number;
    proveedor?: string;
    referencia?: string;
    notas?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.obtenerProducto(dto.productoId);

    const existe = await this.loteRepository.findOne({
      where: { productoId: dto.productoId, numeroLote: dto.numeroLote, empresaId, isActive: true },
    });
    if (existe) throw new ConflictException(`El lote "${dto.numeroLote}" ya existe para este producto`);

    const lote = this.loteRepository.create({
      ...dto,
      empresaId,
      cantidadInicial:    dto.cantidad,
      cantidadDisponible: dto.cantidad,
      costoUnitario:      dto.costoUnitario ?? 0,
      fechaVencimiento:   dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : undefined,
      fechaFabricacion:   dto.fechaFabricacion ? new Date(dto.fechaFabricacion) : undefined,
      estado:             EstadoLote.ACTIVO,
    });
    return this.loteRepository.save(lote);
  }

  async getLotes(productoId?: number, estado?: string, soloVigentes = false) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.loteRepository
      .createQueryBuilder('l')
      .where('l.empresaId = :eid', { eid: empresaId })
      .andWhere('l.isActive = :active', { active: true });

    if (productoId) qb.andWhere('l.productoId = :pid', { pid: productoId });
    if (estado)     qb.andWhere('l.estado = :estado', { estado });
    if (soloVigentes) {
      const hoy = fechaHoyRD();
      qb.andWhere('(l.fechaVencimiento IS NULL OR l.fechaVencimiento >= :hoy)', { hoy });
      qb.andWhere('l.estado = :activo', { activo: EstadoLote.ACTIVO });
    }

    return qb.orderBy('l.fechaVencimiento', 'ASC', 'NULLS LAST').getMany();
  }

  async getAlertasLotes() {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy       = new Date();
    const en30dias  = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
    const en30str   = en30dias.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const hoyStr    = hoy.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

    const [vencidos, proximosAVencer] = await Promise.all([
      this.loteRepository
        .createQueryBuilder('l')
        .where('l.empresaId = :eid', { eid: empresaId })
        .andWhere('l.isActive = true')
        .andWhere('l.estado = :activo', { activo: EstadoLote.ACTIVO })
        .andWhere('l.fechaVencimiento IS NOT NULL')
        .andWhere('l.fechaVencimiento < :hoy', { hoy: hoyStr })
        .andWhere('l.cantidadDisponible > 0')
        .take(500)
        .getMany(),

      this.loteRepository
        .createQueryBuilder('l')
        .where('l.empresaId = :eid', { eid: empresaId })
        .andWhere('l.isActive = true')
        .andWhere('l.estado = :activo', { activo: EstadoLote.ACTIVO })
        .andWhere('l.fechaVencimiento IS NOT NULL')
        .andWhere('l.fechaVencimiento >= :hoy', { hoy: hoyStr })
        .andWhere('l.fechaVencimiento <= :en30', { en30: en30str })
        .andWhere('l.cantidadDisponible > 0')
        .orderBy('l.fechaVencimiento', 'ASC')
        .take(500)
        .getMany(),
    ]);

    return { vencidos, proximosAVencer };
  }

  async updateLote(id: number, dto: Partial<{ estado: EstadoLote; cantidadDisponible: number; notas: string }>) {
    const empresaId = this.tenantService.getEmpresaId();
    const lote = await this.loteRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!lote) throw new NotFoundException(`Lote #${id} no encontrado`);
    await this.loteRepository.update(id, dto as any);
    return this.loteRepository.findOne({ where: { id, empresaId, isActive: true } });
  }

  // ──────────────────────────────────────────────────────────
  // Seriales
  // ──────────────────────────────────────────────────────────

  async registrarSeriales(dto: {
    productoId: number;
    numeros: string[];
    loteId?: number;
    costoUnitario?: number;
    fechaVencimientoGarantia?: string;
    notas?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.obtenerProducto(dto.productoId);

    const existentes = await this.serialRepository
      .createQueryBuilder('s')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.productoId = :pid', { pid: dto.productoId })
      .andWhere('s.numeroSerie IN (:...nums)', { nums: dto.numeros })
      .andWhere('s.isActive = true')
      .getMany();

    if (existentes.length > 0) {
      const dupes = existentes.map(s => s.numeroSerie).join(', ');
      throw new ConflictException(`Seriales ya registrados: ${dupes}`);
    }

    const seriales = dto.numeros.map(num =>
      this.serialRepository.create({
        productoId:              dto.productoId,
        numeroSerie:             num,
        loteId:                  dto.loteId,
        costoUnitario:           dto.costoUnitario ?? 0,
        fechaVencimientoGarantia: dto.fechaVencimientoGarantia ? new Date(dto.fechaVencimientoGarantia) : undefined,
        notas:                   dto.notas,
        estado:                  EstadoSerial.DISPONIBLE,
        empresaId,
      }),
    );

    return this.serialRepository.save(seriales);
  }

  async getSeriales(productoId?: number, estado?: string, search?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.serialRepository
      .createQueryBuilder('s')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = true');

    if (productoId) qb.andWhere('s.productoId = :pid', { pid: productoId });
    if (estado)     qb.andWhere('s.estado = :estado', { estado });
    if (search)     qb.andWhere('s.numeroSerie ILIKE :s', { s: `%${search}%` });

    return qb.orderBy('s.createdAt', 'DESC').take(200).getMany();
  }

  async buscarSerial(numeroSerie: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const serial = await this.serialRepository.findOne({
      where: { numeroSerie, empresaId, isActive: true },
    });
    if (!serial) throw new NotFoundException(`Serial "${numeroSerie}" no encontrado`);
    return serial;
  }

  async actualizarEstadoSerial(id: number, dto: {
    estado: EstadoSerial;
    facturaId?: number;
    clienteId?: number;
    fechaVenta?: string;
    notas?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const serial = await this.serialRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!serial) throw new NotFoundException(`Serial #${id} no encontrado`);

    await this.serialRepository.update(id, {
      estado:     dto.estado,
      facturaId:  dto.facturaId,
      clienteId:  dto.clienteId,
      fechaVenta: dto.fechaVenta ? new Date(dto.fechaVenta) : undefined,
      notas:      dto.notas ?? serial.notas,
    } as any);

    return this.serialRepository.findOne({ where: { id, empresaId, isActive: true } });
  }

  async getResumenSeriales(productoId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.serialRepository
      .createQueryBuilder('s')
      .select('s.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = true');

    if (productoId) qb.andWhere('s.productoId = :pid', { pid: productoId });
    return qb.groupBy('s.estado').getRawMany();
  }

  // ── Solicitudes de Ajuste de Inventario ────────────────────────────────────

  async createSolicitudAjuste(dto: { productoId: number; cantidadNueva: number; motivo: string }, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.obtenerProducto(dto.productoId);
    const solicitud = this.solicitudAjusteRepository.create({
      productoId: dto.productoId,
      cantidadNueva: dto.cantidadNueva,
      motivo: dto.motivo,
      userId,
      estado: EstadoSolicitudAjuste.PENDIENTE,
      empresaId,
    });
    return this.solicitudAjusteRepository.save(solicitud);
  }

  async getSolicitudesAjuste(estado?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.solicitudAjusteRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.producto', 'producto')
      .leftJoinAndSelect('s.user', 'usuario')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = true');

    if (estado) qb.andWhere('s.estado = :estado', { estado });

    return qb.orderBy('s.createdAt', 'DESC').take(500).getMany();
  }

  async aprobarSolicitudAjuste(id: number, adminId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const solicitud = await this.solicitudAjusteRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!solicitud) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    if (solicitud.estado !== EstadoSolicitudAjuste.PENDIENTE) {
      throw new BadRequestException(`La solicitud ya está ${solicitud.estado}`);
    }

    await this.registrarAjuste(solicitud.productoId, Number(solicitud.cantidadNueva), adminId, solicitud.motivo);
    await this.solicitudAjusteRepository.update(id, { estado: EstadoSolicitudAjuste.APROBADA, adminId });
    return { message: 'Ajuste aprobado y aplicado' };
  }

  async rechazarSolicitudAjuste(id: number, adminId: number, motivoRechazo: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const solicitud = await this.solicitudAjusteRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!solicitud) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    if (solicitud.estado !== EstadoSolicitudAjuste.PENDIENTE) {
      throw new BadRequestException(`La solicitud ya está ${solicitud.estado}`);
    }
    await this.solicitudAjusteRepository.update(id, { estado: EstadoSolicitudAjuste.RECHAZADA, adminId, motivoRechazo });
    return { message: 'Solicitud rechazada' };
  }

  // ── Cron: alerta de stock mínimo (7 AM hora RD, todos los días) ────────────

  @Cron('0 7 * * *', { timeZone: 'America/Santo_Domingo' })
  async alertarStockMinimo() {
    try {
      // Productos bajo mínimo agrupados por empresa
      const rows = await this.ds.query<{
        empresaId: number; empresaNombre: string;
        productoNombre: string; referencia: string | null;
        stock: number; stockMinimo: number;
      }[]>(`
        SELECT
          p."empresaId",
          e.nombre AS "empresaNombre",
          p.nombre AS "productoNombre",
          p.referencia,
          p.stock,
          p."stockMinimo"
        FROM productos p
        JOIN empresa e ON e.id = p."empresaId"
        WHERE p."isActive"   = true
          AND p."stockMinimo" > 0
          AND p.stock <= p."stockMinimo"
        ORDER BY p."empresaId", p.nombre
      `);

      if (!rows.length) return;

      // Agrupar por empresa
      const porEmpresa = new Map<number, typeof rows>();
      for (const r of rows) {
        if (!porEmpresa.has(r.empresaId)) porEmpresa.set(r.empresaId, []);
        porEmpresa.get(r.empresaId)!.push(r);
      }

      for (const [empresaId, productos] of porEmpresa) {
        // Obtener emails de admins de esta empresa
        const admins = await this.ds.query<{ email: string }[]>(`
          SELECT u.email
          FROM usuario_empresa ue
          JOIN users u ON u.id = ue."usuarioId"
          WHERE ue."empresaId" = $1
            AND ue."isActive"  = true
            AND u."isActive"   = true
            AND u.role         = 'admin'
            AND u.email IS NOT NULL
          LIMIT 5
        `, [empresaId]);

        if (!admins.length) continue;

        const filas = productos.map(p => `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${p.productoNombre}${p.referencia ? ` (${p.referencia})` : ''}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center;color:${p.stock === 0 ? '#dc2626' : '#d97706'};font-weight:600">${p.stock}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${p.stockMinimo}</td>
          </tr>`).join('');

        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="background:#1d4ed8;color:#fff;padding:16px 24px;margin:0">
              ⚠️ Alerta de Stock Mínimo — ${productos[0].empresaNombre}
            </h2>
            <p style="padding:16px 24px 0">
              Los siguientes productos han alcanzado o están por debajo de su stock mínimo:
            </p>
            <table style="width:100%;border-collapse:collapse;margin:0 24px;width:calc(100% - 48px)">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:8px 12px;text-align:left">Producto</th>
                  <th style="padding:8px 12px;text-align:center">Stock Actual</th>
                  <th style="padding:8px 12px;text-align:center">Stock Mínimo</th>
                </tr>
              </thead>
              <tbody>${filas}</tbody>
            </table>
            <p style="padding:16px 24px;color:#6b7280;font-size:13px">
              Ingresa a HiCloud ERP → Inventario para gestionar las órdenes de compra.
            </p>
          </div>`;

        await this.emailService.enviar({
          to: admins.map(a => a.email),
          subject: `⚠️ ${productos.length} producto(s) bajo stock mínimo — ${productos[0].empresaNombre}`,
          html,
        });

        this.logger.log(`[StockCron] Alerta enviada a ${admins.length} admin(s) de empresa ${empresaId} — ${productos.length} producto(s)`);
      }
    } catch (err: any) {
      this.logger.error('[StockCron] Error en alerta de stock mínimo', err?.stack ?? err?.message);
    }
  }
}
