import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { Almacen } from '../almacenes/entities/almacen.entity';
import { StockAlmacen } from '../almacenes/entities/stock-almacen.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LimitesService } from '../suscripciones/limites.service';

@Injectable()
export class ProductosService {
  private readonly logger = new Logger(ProductosService.name);

  constructor(
    @InjectRepository(Producto)
    private productoRepository: Repository<Producto>,
    @InjectRepository(Almacen)
    private almacenRepository:  Repository<Almacen>,
    @InjectRepository(StockAlmacen)
    private stockAlmacenRepository: Repository<StockAlmacen>,
    private tenantService:  TenantService,
    private realtimeService: RealtimeService,
    private limitesService: LimitesService,
  ) {}

  // Inicializa o actualiza stock_almacen para un producto en un almacén dado.
  private async sincronizarStockAlmacen(
    productoId: number,
    empresaId: number,
    stock: number,
    almacenId?: number,
  ): Promise<void> {
    if (!almacenId) {
      // Si no se especifica almacén, usar el primero activo del tenant
      const primero = await this.almacenRepository.findOne({
        where: { empresaId, isActive: true, activo: true } as any,
        order: { id: 'ASC' },
      });
      if (!primero) return; // Sin almacenes configurados — no hacer nada
      almacenId = primero.id;
    }

    const existing = await this.stockAlmacenRepository.findOne({
      where: { productoId, almacenId } as any,
    });

    if (existing) {
      await this.stockAlmacenRepository.update(existing.id, { stock });
    } else {
      await this.stockAlmacenRepository.save(
        this.stockAlmacenRepository.create({ productoId, almacenId, empresaId, stock } as any),
      );
    }
  }

  async create(dto: CreateProductoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.limitesService.verificarLimiteProductos(empresaId);

    // Sanitizar código: undefined/null/vacío/string-literal → undefined para no hacer query con valor basura
    if (!dto.codigo || dto.codigo === 'undefined' || dto.codigo === 'null' || !dto.codigo.trim()) {
      dto.codigo = undefined;
    }

    const byNombre = await this.productoRepository.findOne({ where: { nombre: dto.nombre, empresaId, isActive: true } });
    if (byNombre) throw new ConflictException(`Ya existe un producto con el nombre '${dto.nombre}'`);

    if (dto.codigo) {
      const byCodigo = await this.productoRepository.findOne({ where: { codigo: dto.codigo, empresaId, isActive: true } });
      if (byCodigo) throw new ConflictException(`Ya existe un producto con el código '${dto.codigo}'`);
    }

    const { almacenId, ...productoData } = dto;
    const producto = this.productoRepository.create({ ...productoData, empresaId });
    const saved = await this.productoRepository.save(producto);

    // Registrar stock inicial en stock_almacen (solo para productos físicos con stock)
    if (dto.tipo !== 'servicio' && (dto.stock ?? 0) > 0) {
      await this.sincronizarStockAlmacen(saved.id, empresaId, dto.stock!, almacenId).catch(
        (err: Error) => this.logger.warn(`stock_almacen no sincronizado en producto #${saved.id}: ${err.message}`),
      );
    }

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

  async findByIds(ids: number[]): Promise<Map<number, Producto>> {
    if (ids.length === 0) return new Map();
    const empresaId = this.tenantService.getEmpresaId();
    const productos = await this.productoRepository.find({
      where: { id: In(ids), empresaId, isActive: true },
    });
    const map = new Map<number, Producto>();
    for (const p of productos) map.set(p.id, p);
    return map;
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

    // Sanitizar código: undefined/null/vacío/string-literal → undefined
    if (dto.codigo !== undefined && (!dto.codigo || dto.codigo === 'undefined' || dto.codigo === 'null' || !dto.codigo.trim())) {
      dto.codigo = undefined;
    }

    if (dto.codigo && dto.codigo !== producto.codigo) {
      const codExists = await this.productoRepository.findOne({
        where: { codigo: dto.codigo, empresaId, isActive: true },
      });
      if (codExists) throw new ConflictException(`Ya existe un producto con el código '${dto.codigo}'`);
    }

    if (dto.nombre && dto.nombre !== producto.nombre) {
      const nomExists = await this.productoRepository
        .createQueryBuilder('p')
        .where('p.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('p.empresaId = :empresaId', { empresaId })
        .andWhere('p.isActive = :active', { active: true })
        .andWhere('p.id != :id', { id })
        .getOne();
      if (nomExists) throw new ConflictException(`Ya existe un producto con el nombre '${dto.nombre}'`);
    }

    const { almacenId, ...updateData } = dto as any;
    await this.productoRepository.update(id, updateData);

    // Sincronizar stock_almacen si se indicó almacén y el producto tiene stock
    if (almacenId && dto.tipo !== 'servicio' && dto.stock != null) {
      await this.sincronizarStockAlmacen(id, empresaId, dto.stock, almacenId).catch(
        (err: Error) => this.logger.warn(`stock_almacen no sincronizado en producto #${id}: ${err.message}`),
      );
    }

    this.realtimeService.notify(empresaId, 'producto', 'updated', id);
    return this.findOne(id);
  }

  async checkDuplicado(campo: 'codigo' | 'nombre', valor: string, excludeId?: number): Promise<{ disponible: boolean }> {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.productoRepository
      .createQueryBuilder('p')
      .where(`p.${campo} = :valor`, { valor })
      .andWhere('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.isActive = :active', { active: true });
    if (excludeId) qb.andWhere('p.id != :excludeId', { excludeId });
    const found = await qb.getOne();
    return { disponible: !found };
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
