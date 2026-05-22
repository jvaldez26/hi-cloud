import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Movimiento, TipoMovimiento } from './entities/movimiento.entity';
import { LoteProducto, EstadoLote } from './entities/lote-producto.entity';
import { SerialProducto, EstadoSerial } from './entities/serial-producto.entity';
import { Producto } from '../productos/entities/producto.entity';
import { RegistrarEntradaDto } from './dto/registrar-entrada.dto';
import { RegistrarSalidaDto } from './dto/registrar-salida.dto';
import { RegistrarAjusteDto } from './dto/registrar-ajuste.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(Movimiento)
    private movimientoRepository: Repository<Movimiento>,
    @InjectRepository(Producto)
    private productoRepository: Repository<Producto>,
    @InjectRepository(LoteProducto)
    private loteRepository: Repository<LoteProducto>,
    @InjectRepository(SerialProducto)
    private serialRepository: Repository<SerialProducto>,
    private realtimeService: RealtimeService,
    private tenantService: TenantService,
  ) {}

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
  ): Promise<Movimiento> {
    const movimiento = this.movimientoRepository.create({
      tipo, productoId, cantidad, cantidadAnterior, cantidadNueva,
      motivo, referencia, userId,
      ...(empresaId ? { empresaId } : {}),
    });
    return this.movimientoRepository.save(movimiento);
  }

  // ──────────────────────────────────────────────────────────
  // Operaciones básicas de inventario
  // ──────────────────────────────────────────────────────────

  async registrarEntrada(productoId: number, cantidad: number, userId: number, motivo?: string, referencia?: string) {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const cantidadNueva = Number((cantidadAnterior + cantidad).toFixed(4));

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);

    return this.persistirMovimiento(TipoMovimiento.ENTRADA, productoId, cantidad, cantidadAnterior, cantidadNueva, userId, motivo, referencia, producto.empresaId);
  }

  async registrarSalida(productoId: number, cantidad: number, userId: number, motivo?: string, referencia?: string) {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);

    if (cantidadAnterior < cantidad) {
      throw new BadRequestException(
        `Stock insuficiente para "${producto.nombre}". Disponible: ${cantidadAnterior}, requerido: ${cantidad}`,
      );
    }

    const cantidadNueva = Number((cantidadAnterior - cantidad).toFixed(4));
    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);

    return this.persistirMovimiento(TipoMovimiento.SALIDA, productoId, cantidad, cantidadAnterior, cantidadNueva, userId, motivo, referencia, producto.empresaId);
  }

  async registrarDevolucion(productoId: number, cantidad: number, userId: number, motivo?: string, referencia?: string) {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const cantidadNueva = Number((cantidadAnterior + cantidad).toFixed(4));

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);

    return this.persistirMovimiento(TipoMovimiento.DEVOLUCION, productoId, cantidad, cantidadAnterior, cantidadNueva, userId, motivo, referencia, producto.empresaId);
  }

  async registrarAjuste(productoId: number, cantidadNueva: number, userId: number, motivo: string) {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const diferencia = Math.abs(cantidadNueva - cantidadAnterior);

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    return this.persistirMovimiento(TipoMovimiento.AJUSTE, productoId, diferencia, cantidadAnterior, cantidadNueva, userId, motivo);
  }

  // ──────────────────────────────────────────────────────────
  // Consultas de movimientos
  // ──────────────────────────────────────────────────────────

  async getMovimientos(pagination: PaginationDto & { tipo?: string; desde?: string; hasta?: string }) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search, tipo, desde, hasta } = pagination;

    const qb = this.movimientoRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.producto', 'producto')
      .leftJoinAndSelect('m.user', 'usuario')
      .where('m.empresaId = :eid', { eid: empresaId })
      .andWhere('m.isActive = :active', { active: true });

    if (search) qb.andWhere('(producto.nombre ILIKE :s OR producto.codigo ILIKE :s OR m.referencia ILIKE :s OR m.motivo ILIKE :s)', { s: `%${search}%` });
    if (tipo)  qb.andWhere('m.tipo = :tipo', { tipo });
    if (desde) qb.andWhere('m.createdAt >= :desde', { desde });
    if (hasta) qb.andWhere('m.createdAt <= :hasta', { hasta: `${hasta} 23:59:59` });

    const [data, total] = await qb
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getMovimientosPorProducto(productoId: number, pagination: PaginationDto) {
    await this.obtenerProducto(productoId);
    const { limit = 20, page = 1 } = pagination;
    const [data, total] = await this.movimientoRepository.findAndCount({
      where: { productoId, isActive: true },
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
      .getMany();
  }

  // ──────────────────────────────────────────────────────────
  // DTOs wrapper
  // ──────────────────────────────────────────────────────────

  async registrarEntradaDesdeDto(dto: RegistrarEntradaDto, userId: number) {
    return this.registrarEntrada(dto.productoId, dto.cantidad, userId, dto.motivo, dto.referencia);
  }
  async registrarSalidaDesdeDto(dto: RegistrarSalidaDto, userId: number) {
    return this.registrarSalida(dto.productoId, dto.cantidad, userId, dto.motivo, dto.referencia);
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
        .getMany(),
    ]);

    return { vencidos, proximosAVencer };
  }

  async updateLote(id: number, dto: Partial<{ estado: EstadoLote; cantidadDisponible: number; notas: string }>) {
    const empresaId = this.tenantService.getEmpresaId();
    const lote = await this.loteRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!lote) throw new NotFoundException(`Lote #${id} no encontrado`);
    await this.loteRepository.update(id, dto as any);
    return this.loteRepository.findOne({ where: { id } });
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

    return this.serialRepository.findOne({ where: { id } });
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
}
