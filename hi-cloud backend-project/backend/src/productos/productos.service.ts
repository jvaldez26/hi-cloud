import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  OnModuleInit,
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
import { S3Service } from '../common/s3/s3.service';

// Bucket dedicado para imágenes de productos
const IMAGENES_BUCKET = 'hicloud-backups-966448715183';
const IMAGENES_FOLDER = 'imagenes/productos';

@Injectable()
export class ProductosService implements OnModuleInit {
  private readonly logger = new Logger(ProductosService.name);

  constructor(
    @InjectRepository(Producto)
    private productoRepository: Repository<Producto>,
    @InjectRepository(Almacen)
    private almacenRepository:  Repository<Almacen>,
    @InjectRepository(StockAlmacen)
    private stockAlmacenRepository: Repository<StockAlmacen>,
    private tenantService:   TenantService,
    private realtimeService: RealtimeService,
    private limitesService:  LimitesService,
    private s3Service:       S3Service,
  ) {}

  async onModuleInit() {
    // Migrar imágenes base64 existentes a S3 (operación idempotente, 1 vez)
    try {
      await this.migrateBase64ImagesToS3();
    } catch (err: unknown) {
      this.logger.warn(`Migración base64→S3 saltada: ${(err as Error).message}`);
    }
  }

  private async migrateBase64ImagesToS3(): Promise<void> {
    const productos = await this.productoRepository
      .createQueryBuilder('p')
      .where("p.\"imagenUrl\" LIKE 'data:image%'")
      .select(['p.id', 'p.nombre', 'p.imagenUrl', 'p.empresaId'])
      .getMany();

    if (productos.length === 0) return;

    this.logger.log(`Migrando ${productos.length} imagen(es) base64 → S3...`);

    for (const producto of productos) {
      try {
        const { buffer, ext, mimetype } = this.parseBase64(producto.imagenUrl!);
        const url = await this.s3Service.upload(
          buffer,
          `producto-${producto.id}.${ext}`,
          mimetype,
          IMAGENES_FOLDER,
          producto.empresaId,
          IMAGENES_BUCKET,
        );
        if (url) {
          await this.productoRepository.update(producto.id, { imagenUrl: url });
          this.logger.log(`Producto #${producto.id} (${producto.nombre}): imagen → ${url}`);
        }
      } catch (err: unknown) {
        this.logger.warn(`Producto #${producto.id}: error migrando imagen — ${(err as Error).message}`);
      }
    }
  }

  private parseBase64(dataUrl: string): { buffer: Buffer; mimetype: string; ext: string } {
    const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!match) throw new BadRequestException('Formato base64 inválido — se esperaba data:image/...;base64,...');
    const [, mimetype, data] = match;
    const buffer = Buffer.from(data, 'base64');
    const ext = mimetype.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    return { buffer, mimetype, ext };
  }

  /** Sube imagen de producto a S3 desde un Buffer (multipart upload) */
  async subirImagen(id: number, buffer: Buffer, mimetype: string): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findOne(id); // valida que el producto existe y pertenece al tenant
    const ext = mimetype.split('/')[1].replace('jpeg', 'jpg');
    const url = await this.s3Service.upload(
      buffer,
      `producto-${id}.${ext}`,
      mimetype,
      IMAGENES_FOLDER,
      empresaId,
      IMAGENES_BUCKET,
    );
    if (!url) throw new BadRequestException('S3 no disponible — configura AWS_REGION y rol IAM en EC2');
    await this.productoRepository.update(id, { imagenUrl: url });
    this.realtimeService.notify(empresaId, 'producto', 'updated', id);
    return url;
  }

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
    if (!saved.codigo) {
      const generado = `PROD-${String(saved.id).padStart(4, '0')}`;
      await this.productoRepository.update(saved.id, { codigo: generado });
      saved.codigo = generado;
    }

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

    // Si viene base64 en imagenUrl, subirla a S3 antes de guardar
    if (dto.imagenUrl?.startsWith('data:image')) {
      try {
        const { buffer, ext, mimetype } = this.parseBase64(dto.imagenUrl);
        const url = await this.s3Service.upload(
          buffer, `producto-${id}.${ext}`, mimetype,
          IMAGENES_FOLDER, empresaId, IMAGENES_BUCKET,
        );
        if (url) dto.imagenUrl = url;
      } catch (err: unknown) {
        this.logger.warn(`Producto #${id}: base64 no subido a S3 — ${(err as Error).message}`);
      }
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
