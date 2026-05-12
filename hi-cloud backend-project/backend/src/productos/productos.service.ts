import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LimitesService } from '../suscripciones/limites.service';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private productoRepository: Repository<Producto>,
    private tenantService:  TenantService,
    private realtimeService: RealtimeService,
    private limitesService: LimitesService,
  ) {}

  async create(dto: CreateProductoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.limitesService.verificarLimiteProductos(empresaId);

    const existing = await this.productoRepository.findOne({
      where: { codigo: dto.codigo, empresaId, isActive: true },
    });
    if (existing) throw new ConflictException(`Código ${dto.codigo} ya existe en esta empresa`);

    const producto = this.productoRepository.create({ ...dto, empresaId });
    const saved = await this.productoRepository.save(producto);
    this.realtimeService.notify(empresaId, 'producto', 'created', saved.id);
    return saved;
  }

  async findAll(pagination: PaginationDto) {
    const empresaId        = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.productoRepository
      .createQueryBuilder('producto')
      .where('producto.empresaId = :empresaId', { empresaId })
      .andWhere('producto.isActive = :active', { active: true });

    if (search) {
      qb.andWhere(
        '(producto.nombre ILIKE :s OR producto.codigo ILIKE :s OR producto.categoria ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('producto.nombre', 'ASC')
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
    const producto  = await this.productoRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!producto) throw new NotFoundException(`Producto #${id} no encontrado`);
    return producto;
  }

  async findByCodigo(codigo: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const producto  = await this.productoRepository.findOne({
      where: { codigo, empresaId, isActive: true },
    });
    if (!producto) throw new NotFoundException(`Producto con código ${codigo} no encontrado`);
    return producto;
  }

  async findStockBajo() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.productoRepository
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.isActive = :active', { active: true })
      .andWhere('p.stock <= p.stockMinimo')
      .orderBy('p.stock', 'ASC')
      .getMany();
  }

  async update(id: number, dto: UpdateProductoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const producto  = await this.findOne(id);

    if (dto.codigo && dto.codigo !== producto.codigo) {
      const codExists = await this.productoRepository.findOne({
        where: { codigo: dto.codigo, empresaId, isActive: true },
      });
      if (codExists) throw new ConflictException(`Código ${dto.codigo} ya existe`);
    }

    await this.productoRepository.update(id, dto);
    this.realtimeService.notify(empresaId, 'producto', 'updated', id);
    return this.findOne(id);
  }

  async ajustarStock(id: number, cantidad: number) {
    const empresaId  = this.tenantService.getEmpresaId();
    const producto   = await this.findOne(id);
    const nuevoStock = producto.stock + cantidad;
    if (nuevoStock < 0) {
      throw new BadRequestException(`Stock insuficiente. Disponible: ${producto.stock}`);
    }
    await this.productoRepository.update(id, { stock: nuevoStock });
    this.realtimeService.notify(empresaId, 'producto', 'updated', id);
    return this.findOne(id);
  }

  async remove(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const producto  = await this.findOne(id);
    await this.productoRepository.update(id, { isActive: false });
    this.realtimeService.notify(empresaId, 'producto', 'deleted', id);
    return { message: `Producto "${producto.nombre}" eliminado` };
  }
}
