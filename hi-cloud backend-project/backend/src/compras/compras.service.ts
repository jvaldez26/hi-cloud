import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Compra, CompraEstado } from './entities/compra.entity';
import { CompraDetalle } from './entities/compra-detalle.entity';
import { CreateCompraDto } from './dto/create-compra.dto';
import { ProveedoresService } from '../proveedores/proveedores.service';
import { ProductosService } from '../productos/productos.service';
import { InventarioService } from '../inventario/inventario.service';
import { CxPService } from '../cxp/cxp.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';

const ITBIS_DEFAULT = 18;

@Injectable()
export class ComprasService {
  constructor(
    @InjectRepository(Compra)
    private compraRepository: Repository<Compra>,
    @InjectRepository(CompraDetalle)
    private detalleRepository:  Repository<CompraDetalle>,
    private proveedoresService: ProveedoresService,
    private productosService:   ProductosService,
    private inventarioService:  InventarioService,
    private cxpService:         CxPService,
    private asientosService:    AsientosAutomaticosService,
    private tenantService:      TenantService,
    private realtimeService:    RealtimeService,
  ) {}

  private async generarFolio(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.compraRepository.count();
    return `COM-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateCompraDto, usuario: User) {
    await this.proveedoresService.findOne(dto.proveedorId);

    const detallesData: Partial<CompraDetalle>[] = [];
    let subtotalCompra = 0;
    let itbisCompra = 0;

    for (const item of dto.detalles) {
      const producto = await this.productosService.findOne(item.productoId);
      const porcentajeItbis = item.porcentajeItbis ?? ITBIS_DEFAULT;
      const subtotal = Number(item.precioUnitario) * item.cantidad;
      const importeItbis = Number((subtotal * (porcentajeItbis / 100)).toFixed(2));
      const total = Number((subtotal + importeItbis).toFixed(2));

      subtotalCompra += subtotal;
      itbisCompra += importeItbis;

      detallesData.push({
        productoId: item.productoId,
        descripcion: item.descripcion ?? producto.nombre,
        precioUnitario: item.precioUnitario,
        cantidad: item.cantidad,
        porcentajeItbis,
        subtotal,
        importeItbis,
        total,
      });
    }

    const folio     = await this.generarFolio();
    const empresaId = this.tenantService.getEmpresaId();

    const compra = this.compraRepository.create({
      empresaId,
      folio,
      fecha: new Date(dto.fecha),
      proveedorId:            dto.proveedorId,
      usuarioId:              usuario.id,
      notas:                  dto.notas,
      numeroFacturaProveedor: dto.numeroFacturaProveedor,
      subtotal:               Number(subtotalCompra.toFixed(2)),
      itbis:                  Number(itbisCompra.toFixed(2)),
      total:                  Number((subtotalCompra + itbisCompra).toFixed(2)),
    });

    const savedCompra = await this.compraRepository.save(compra);

    const detalles = this.detalleRepository.create(
      detallesData.map((d) => ({ ...d, compraId: savedCompra.id })),
    );
    await this.detalleRepository.save(detalles);

    this.realtimeService.notify(empresaId, 'compra', 'created', savedCompra.id);
    return this.findOne(savedCompra.id);
  }

  async findAll(pagination: PaginationDto & {
    estado?: string; desde?: string; hasta?: string; proveedorId?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search, estado, desde, hasta, proveedorId } = pagination;

    const qb = this.compraRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'proveedor')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.isActive = :active', { active: true });

    if (search) {
      qb.andWhere(
        '(c.folio ILIKE :s OR proveedor.nombre ILIKE :s OR proveedor.rnc ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (estado)      qb.andWhere('c.estado = :estado',           { estado });
    if (proveedorId) qb.andWhere('c.proveedorId = :proveedorId', { proveedorId });
    if (desde)       qb.andWhere('c.fecha >= :desde',            { desde });
    if (hasta)       qb.andWhere('c.fecha <= :hasta',            { hasta });

    const [data, total] = await qb
      .orderBy('c.fecha', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const compra = await this.compraRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['proveedor', 'usuario', 'detalles', 'detalles.producto'],
    });
    if (!compra) throw new NotFoundException(`Compra #${id} no encontrada`);
    return compra;
  }

  async cambiarEstado(id: number, estado: CompraEstado) {
    const compra = await this.findOne(id);

    const transiciones: Record<CompraEstado, CompraEstado[]> = {
      [CompraEstado.BORRADOR]: [CompraEstado.RECIBIDA, CompraEstado.CANCELADA],
      [CompraEstado.RECIBIDA]: [CompraEstado.PAGADA, CompraEstado.CANCELADA],
      [CompraEstado.PAGADA]: [],
      [CompraEstado.CANCELADA]: [],
    };

    if (!transiciones[compra.estado].includes(estado)) {
      throw new BadRequestException(
        `No se puede cambiar de "${compra.estado}" a "${estado}"`,
      );
    }

    if (estado === CompraEstado.RECIBIDA) {
      // 1. Registrar entrada en inventario
      for (const detalle of compra.detalles) {
        await this.inventarioService.registrarEntrada(
          detalle.productoId,
          Number(detalle.cantidad),
          compra.usuarioId,
          `Compra recibida: ${compra.folio}`,
          compra.folio,
        );
      }

      // 2. Crear cuenta por pagar automáticamente (30 días por defecto)
      await this.cxpService.crear(compra.id, compra.usuarioId);

      // 3. Asiento contable automático
      await this.asientosService.asientoCompraRecibida(
        compra.id,
        Number(compra.total),
        Number(compra.subtotal),
        Number(compra.itbis),
        compra.folio,
        compra.usuarioId,
      );
    }

    if (estado === CompraEstado.CANCELADA && compra.estado === CompraEstado.RECIBIDA) {
      for (const detalle of compra.detalles) {
        await this.inventarioService.registrarDevolucion(
          detalle.productoId,
          Number(detalle.cantidad),
          compra.usuarioId,
          `Cancelación compra: ${compra.folio}`,
          compra.folio,
        );
      }
    }

    await this.compraRepository.update(id, { estado });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'compra', 'updated', id);
    return this.findOne(id);
  }

  async resumenPorEstado() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.compraRepository
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .addSelect('SUM(c.subtotal)', 'subtotalTotal')
      .addSelect('SUM(c.itbis)', 'itbisTotal')
      .addSelect('SUM(c.total)', 'montoTotal')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.isActive = :active', { active: true })
      .groupBy('c.estado')
      .getRawMany();
  }

  async remove(id: number) {
    const compra = await this.findOne(id);
    if (compra.estado !== CompraEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar compras en estado borrador');
    }
    await this.compraRepository.update(id, { isActive: false });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'compra', 'deleted', id);
    return { message: `Compra ${compra.folio} eliminada` };
  }
}
