import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movimiento, TipoMovimiento } from './entities/movimiento.entity';
import { Producto } from '../productos/entities/producto.entity';
import { RegistrarEntradaDto } from './dto/registrar-entrada.dto';
import { RegistrarSalidaDto } from './dto/registrar-salida.dto';
import { RegistrarAjusteDto } from './dto/registrar-ajuste.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(Movimiento)
    private movimientoRepository: Repository<Movimiento>,
    @InjectRepository(Producto)
    private productoRepository:   Repository<Producto>,
    private realtimeService:      RealtimeService,
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
      tipo,
      productoId,
      cantidad,
      cantidadAnterior,
      cantidadNueva,
      motivo,
      referencia,
      userId,
      ...(empresaId ? { empresaId } : {}),
    });
    return this.movimientoRepository.save(movimiento);
  }

  // ──────────────────────────────────────────────────────────
  // Operaciones públicas — usadas por controller Y otros servicios
  // ──────────────────────────────────────────────────────────

  async registrarEntrada(
    productoId: number,
    cantidad: number,
    userId: number,
    motivo?: string,
    referencia?: string,
  ): Promise<Movimiento> {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const cantidadNueva = Number((cantidadAnterior + cantidad).toFixed(4));

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);

    return this.persistirMovimiento(
      TipoMovimiento.ENTRADA,
      productoId,
      cantidad,
      cantidadAnterior,
      cantidadNueva,      userId,
      motivo,
      referencia,
      producto.empresaId,
    );
  }

  async registrarSalida(
    productoId: number,
    cantidad: number,
    userId: number,
    motivo?: string,
    referencia?: string,
  ): Promise<Movimiento> {
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

    return this.persistirMovimiento(
      TipoMovimiento.SALIDA,
      productoId,
      cantidad,
      cantidadAnterior,
      cantidadNueva,      userId,
      motivo,
      referencia,
      producto.empresaId,
    );
  }

  async registrarDevolucion(
    productoId: number,
    cantidad: number,
    userId: number,
    motivo?: string,
    referencia?: string,
  ): Promise<Movimiento> {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const cantidadNueva = Number((cantidadAnterior + cantidad).toFixed(4));

    await this.productoRepository.update(productoId, { stock: cantidadNueva });
    if (producto.empresaId) this.realtimeService.notify(producto.empresaId, 'producto', 'updated', productoId);

    return this.persistirMovimiento(
      TipoMovimiento.DEVOLUCION,
      productoId,
      cantidad,
      cantidadAnterior,
      cantidadNueva,      userId,
      motivo,
      referencia,
      producto.empresaId,
    );
  }

  async registrarAjuste(
    productoId: number,
    cantidadNueva: number,
    userId: number,
    motivo: string,
  ): Promise<Movimiento> {
    const producto = await this.obtenerProducto(productoId);
    const cantidadAnterior = Number(producto.stock);
    const diferencia = Math.abs(cantidadNueva - cantidadAnterior);

    await this.productoRepository.update(productoId, { stock: cantidadNueva });

    return this.persistirMovimiento(
      TipoMovimiento.AJUSTE,
      productoId,
      diferencia,
      cantidadAnterior,
      cantidadNueva,
      userId,
      motivo,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────────────────

  async getMovimientos(pagination: PaginationDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.movimientoRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.producto', 'producto')
      .leftJoinAndSelect('m.user', 'usuario')
      .where('m.empresaId = :eid', { eid: empresaId })
      .andWhere('m.isActive = :active', { active: true });

    if (search) {
      qb.andWhere(
        '(producto.nombre ILIKE :s OR producto.codigo ILIKE :s OR m.referencia ILIKE :s OR m.motivo ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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

  // Método para uso del controller con DTO
  async registrarEntradaDesdeDto(dto: RegistrarEntradaDto, userId: number) {
    return this.registrarEntrada(dto.productoId, dto.cantidad, userId, dto.motivo, dto.referencia);
  }

  async registrarSalidaDesdeDto(dto: RegistrarSalidaDto, userId: number) {
    return this.registrarSalida(dto.productoId, dto.cantidad, userId, dto.motivo, dto.referencia);
  }

  async registrarAjusteDesdeDto(dto: RegistrarAjusteDto, userId: number) {
    return this.registrarAjuste(dto.productoId, dto.cantidadNueva, userId, dto.motivo);
  }
}
