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
import { Movimiento, TipoMovimiento } from '../inventario/entities/movimiento.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PreviewAjustePreciosDto, AplicarAjustePreciosDto } from './dto/ajuste-precios.dto';
import { calcularFila } from './ajuste-precios.util';
import { TenantService } from '../tenant/tenant.service';
import { ProductoProveedorService } from './producto-proveedor.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LimitesService } from '../suscripciones/limites.service';
import { S3Service } from '../common/s3/s3.service';

// Carpeta dentro de AWS_S3_BUCKET donde se guardan las imágenes
const IMAGENES_FOLDER = 'imagenes/productos';

/** Tope del catálogo POS — mismo que el de findAll(incluirSinStock). */
const CATALOGO_POS_MAX = 5_000;

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
    @InjectRepository(Movimiento)
    private movimientoRepository: Repository<Movimiento>,
    private tenantService:   TenantService,
    private realtimeService: RealtimeService,
    private limitesService:  LimitesService,
    private s3Service:       S3Service,
    private productoProveedorSvc: ProductoProveedorService,
  ) {}

  /** Devuelve todas las categorías distintas del catálogo de la empresa (para Selects). */
  async getCategorias(): Promise<string[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.productoRepository
      .createQueryBuilder('p')
      .select('DISTINCT p.categoria', 'categoria')
      .where('p."empresaId" = :empresaId', { empresaId })
      .andWhere('p."isActive" = true')
      .andWhere('p.categoria IS NOT NULL')
      .andWhere("p.categoria != ''")
      .orderBy('p.categoria', 'ASC')
      .getRawMany<{ categoria: string }>();
    return rows.map(r => r.categoria);
  }

  /** Devuelve todas las marcas distintas del catálogo de la empresa (para Selects). */
  async getMarcas(): Promise<string[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.productoRepository
      .createQueryBuilder('p')
      .select('DISTINCT p.marca', 'marca')
      .where('p."empresaId" = :empresaId', { empresaId })
      .andWhere('p."isActive" = true')
      .andWhere('p.marca IS NOT NULL')
      .andWhere("p.marca != ''")
      .orderBy('p.marca', 'ASC')
      .getRawMany<{ marca: string }>();
    return rows.map(r => r.marca);
  }

  async onModuleInit() {
    // Migrar imágenes base64 existentes a S3 (operación idempotente)
    try { await this.migrateBase64ImagesToS3(); }
    catch (err: unknown) {
      this.logger.warn(`Migración base64→S3 saltada: ${(err as Error).message}`);
    }
    // Nota: las 3 filas históricas con URL absoluta en imagenUrl se normalizan
    // con el script scripts/migrate-imagen-urls.sql — no en el arranque.
    // La retrocompatibilidad en getImagenUrl() / bulkImagenUrls() cubre el
    // período entre el script y el deploy.
  }

  /**
   * Genera URLs firmadas (300 s) en lote para un conjunto de productos.
   * Filtra por empresaId del JWT (aislamiento tenant).
   * Máximo 500 ids por llamada.
   *
   * @returns { [productoId]: signedUrl } — solo incluye productos con imagen S3.
   */
  async bulkImagenUrls(ids: number[]): Promise<Record<number, string>> {
    if (!ids.length) return {};
    const safeIds = ids.slice(0, 500);
    const empresaId = this.tenantService.getEmpresaId();

    const productos = await this.productoRepository
      .createQueryBuilder('p')
      .select(['p.id', 'p.imagenUrl'])
      .where('p.id IN (:...ids)', { ids: safeIds })
      .andWhere('p.empresaId = :empresaId', { empresaId })
      .andWhere('p."imagenUrl" IS NOT NULL')
      .andWhere("p.\"imagenUrl\" NOT LIKE 'data:%'")
      .andWhere("p.\"imagenUrl\" != ''")
      .getMany();

    if (!productos.length) return {};

    const result: Record<number, string> = {};

    await Promise.all(productos.map(async (p) => {
      // Retrocompat: si está guardada como URL absoluta, extraer la key
      const key = p.imagenUrl!.startsWith('http')
        ? new URL(p.imagenUrl!).pathname.slice(1)
        : p.imagenUrl!;

      const url = await this.s3Service.getSignedUrl(key, 300);
      if (url) result[p.id] = url;
    }));

    return result;
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
        const key = await this.s3Service.uploadKey(
          buffer,
          `producto-${producto.id}.${ext}`,
          mimetype,
          IMAGENES_FOLDER,
          producto.empresaId,
        );
        if (key) {
          await this.productoRepository.update(producto.id, { imagenUrl: key });
          this.logger.log(`Producto #${producto.id} (${producto.nombre}): imagen → ${key}`);
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
  async subirImagen(
    id: number,
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ key: string; signedUrl: string | null }> {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findOne(id); // valida que el producto existe y pertenece al tenant
    const ext = mimetype.split('/')[1].replace('jpeg', 'jpg');
    const key = await this.s3Service.uploadKey(
      buffer,
      `producto-${id}.${ext}`,
      mimetype,
      IMAGENES_FOLDER,
      empresaId,
    );
    if (!key) throw new BadRequestException('S3 no disponible — configura AWS_S3_BUCKET y AWS_S3_PROFILE en .env');
    await this.productoRepository.update(id, { imagenUrl: key });
    this.realtimeService.notify(empresaId, 'producto', 'updated', id);
    // URL firmada (5 min) para preview inmediato en el cliente
    const signedUrl = await this.s3Service.getSignedUrl(key, 300);
    return { key, signedUrl };
  }

  /**
   * Genera una URL firmada (5 min) para la imagen de un producto.
   * Soporta retrocompatibilidad: si imagenUrl ya es una URL absoluta,
   * extrae la key antes de firmar.
   */
  async getImagenUrl(id: number): Promise<{ url: string; expiresAt: string }> {
    const empresaId = this.tenantService.getEmpresaId();
    const producto = await this.productoRepository.findOne({ where: { id, empresaId } });
    if (!producto) throw new NotFoundException(`Producto #${id} no encontrado`);

    const imagenUrl = producto.imagenUrl;
    if (!imagenUrl || imagenUrl.startsWith('data:')) {
      throw new NotFoundException('Este producto no tiene imagen en S3');
    }

    // Retrocompatibilidad: si está almacenada como URL completa, extraer la key
    const key = imagenUrl.startsWith('http')
      ? new URL(imagenUrl).pathname.slice(1)
      : imagenUrl;

    const EXPIRY = 300; // 5 minutos
    const url = await this.s3Service.getSignedUrl(key, EXPIRY);
    if (!url) throw new NotFoundException('S3 no disponible para generar URL firmada');

    return { url, expiresAt: new Date(Date.now() + EXPIRY * 1000).toISOString() };
  }

  // Inicializa o actualiza stock_almacen para un producto en un almacén dado.
  private async sincronizarStockAlmacen(
    productoId: number,
    empresaId: number,
    stock: number,
    almacenId?: number,
    ubicacionId?: number,
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
      const patch: any = { stock };
      if (ubicacionId !== undefined) patch.ubicacionId = ubicacionId;
      await this.stockAlmacenRepository.update(existing.id, patch);
    } else {
      await this.stockAlmacenRepository.save(
        this.stockAlmacenRepository.create({
          productoId, almacenId, empresaId, stock,
          ...(ubicacionId ? { ubicacionId } : {}),
        } as any),
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

    // proveedorId se extrae aquí: no es columna de `productos` sino un vínculo en
    // producto_proveedor, y si se colara en productoData TypeORM lo ignoraría en
    // silencio (o peor, el validador de esquema empezaría a quejarse).
    const {
      almacenId: almacenIdDto,
      ubicacionId: ubicacionIdDto,
      proveedorId,
      codigoProveedor,
      ...productoData
    } = dto;
    const almacenId = almacenIdDto ?? this.tenantService.getAlmacenId() ?? undefined;

    // Validación anti-IDOR: ubicacionId debe pertenecer al almacén Y a la empresa del tenant
    let ubicacionId: number | undefined;
    if (ubicacionIdDto && almacenId) {
      const [ubic] = await this.productoRepository.manager.query<any[]>(
        `SELECT id FROM wms_ubicaciones WHERE id = $1 AND "almacenId" = $2 AND "empresaId" = $3 AND "isActive" = true LIMIT 1`,
        [ubicacionIdDto, almacenId, empresaId],
      );
      if (!ubic) throw new BadRequestException(`La ubicación #${ubicacionIdDto} no pertenece al almacén seleccionado`);
      ubicacionId = ubicacionIdDto;
    }

    // Validar unidad de medida para productos pesables (balanzas)
    if (dto.esPesable) {
      await this.validarUnidadPesable(true, productoData.unidadMedida ?? 'PZA', empresaId);
    }

    const producto = this.productoRepository.create({ ...productoData, empresaId });
    const saved = await this.productoRepository.save(producto);
    if (!saved.codigo) {
      const base = String(saved.id).padStart(4, '0');
      const colision = await this.productoRepository.findOne({ where: { codigo: base, empresaId, isActive: true } });
      const generado = (colision && colision.id !== saved.id) ? `${base}-${Date.now()}` : base;
      await this.productoRepository.update(saved.id, { codigo: generado });
      saved.codigo = generado;
    }

    // Registrar stock inicial en stock_almacen (solo para productos físicos con stock)
    if (dto.tipo !== 'servicio' && (dto.stock ?? 0) > 0) {
      await this.sincronizarStockAlmacen(saved.id, empresaId, dto.stock!, almacenId, ubicacionId).catch(
        (err: Error) => this.logger.warn(`stock_almacen no sincronizado en producto #${saved.id}: ${err.message}`),
      );
      // Loguear movimiento de entrada inicial en inventario
      if (almacenId) {
        const userId = this.tenantService.getUserId() ?? 0;
        await this.movimientoRepository.save(
          this.movimientoRepository.create({
            tipo:             TipoMovimiento.ENTRADA,
            productoId:       saved.id,
            cantidad:         dto.stock!,
            cantidadAnterior: 0,
            cantidadNueva:    dto.stock!,
            motivo:           'Stock inicial al crear producto',
            referencia:       saved.codigo ?? undefined,
            userId,
            almacenId,
            empresaId,
          } as any),
        ).catch((err: Error) => this.logger.warn(`movimiento inicial no registrado para producto #${saved.id}: ${err.message}`));
      }
    }

    // Vincular al proveedor, si el alta lo indicó. Opcional a propósito: un
    // producto sin proveedor conocido es legítimo. vincularAlCrear() no lanza —
    // el producto ya está guardado y no se pierde por un dato accesorio.
    if (proveedorId) {
      await this.productoProveedorSvc.vincularAlCrear(saved.id, proveedorId, codigoProveedor);
    }

    this.realtimeService.notify(empresaId, 'producto', 'created', saved.id);
    return saved;
  }

  async findAll(pagination: PaginationDto, incluirSinStock = false, tipo?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const almacenId = this.tenantService.getAlmacenId() ?? undefined;
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.productoRepository
      .createQueryBuilder('producto')
      .where('producto.empresaId = :empresaId', { empresaId })
      .andWhere('producto.isActive = :active', { active: true });

    if (tipo) {
      qb.andWhere('producto.tipo = :tipo', { tipo });
    }

    // Si hay almacén activo en el JWT y no se pide ver todos → filtrar por stock en ese almacén.
    // Los servicios (tipo='servicio') no tienen stock_almacen y siempre se incluyen.
    if (almacenId && !incluirSinStock) {
      qb.leftJoin(
        'stock_almacen',
        'sa',
        'sa."productoId" = producto.id AND sa."almacenId" = :almacenId',
        { almacenId },
      ).andWhere("(producto.tipo = 'servicio' OR sa.stock > 0)");
    }

    if (search) {
      // Búsqueda por tokens: cada palabra debe aparecer en algún campo.
      // Esto resuelve: espacios dobles en nombres ("TUBO  ELECTRICO"), orden
      // de palabras distinto y cualquier variación de espaciado.
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      tokens.forEach((token, i) => {
        const param = `srch${i}`;
        qb.andWhere(
          `(producto.nombre ILIKE :${param} OR producto.codigo ILIKE :${param} OR producto.categoria ILIKE :${param})`,
          { [param]: `%${token}%` },
        );
      });
    }

    const [data, total] = await qb
      .orderBy('producto.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, incluirSinStock ? 5000 : 100))
      .getManyAndCount();

    // Modo admin — catálogo completo con stock desglosado por almacén
    if (incluirSinStock && data.length > 0) {
      const ids = data.map(p => p.id);
      const stocks: any[] = await this.productoRepository.manager.query(
        `SELECT sa."productoId", sa.stock, sa."almacenId", sa."ubicacionId",
                a.nombre AS "almacenNombre",
                u.codigo AS "ubicacionCodigo"
         FROM stock_almacen sa
         INNER JOIN almacenes a ON a.id = sa."almacenId"
         LEFT  JOIN wms_ubicaciones u ON u.id = sa."ubicacionId"
         WHERE sa."productoId" = ANY($1)
           AND sa."empresaId" = $2
           AND sa."isActive" = true
           AND a."isActive" = true
         ORDER BY a.nombre ASC`,
        [ids, empresaId],
      );
      const stockMap = new Map<number, any[]>();
      // Stock del almacén ACTIVO, extraído del mismo resultado — sin query extra.
      const stockActivo = new Map<number, number>();
      for (const s of stocks) {
        const pid = Number(s.productoId);
        if (!stockMap.has(pid)) stockMap.set(pid, []);
        stockMap.get(pid)!.push({
          almacenId:       Number(s.almacenId),
          almacen:         s.almacenNombre,
          cantidad:        Number(s.stock),
          ubicacionId:     s.ubicacionId ? Number(s.ubicacionId) : undefined,
          ubicacionCodigo: s.ubicacionCodigo ?? undefined,
        });
        if (almacenId && Number(s.almacenId) === Number(almacenId)) {
          stockActivo.set(pid, Number(s.stock));
        }
      }
      // BUG CORREGIDO: esta rama devolvía `p.stock` tal cual, es decir el stock
      // GLOBAL de la tabla productos (todos los almacenes sumados), porque el
      // return de aquí se adelanta a la rama de más abajo que sí lo sustituye
      // por el del almacén activo. En empresas multi-sucursal el POS mostraba
      // el consolidado: el badge decía 12 cuando en esa sucursal había 3.
      //
      // Los productos sin stock siguen incluyéndose (el cajero necesita verlos);
      // lo que cambia es QUÉ número se muestra, no QUÉ productos se devuelven.
      //
      // Los servicios se dejan intactos: no tienen fila en stock_almacen y
      // ponerles 0 los marcaría como agotados.
      return {
        data: data.map(p => ({
          ...p,
          ...(almacenId && p.tipo !== 'servicio'
            ? { stock: stockActivo.get(p.id) ?? 0 }
            : {}),
          stockPorAlmacen: stockMap.get(p.id) ?? [],
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    // Modo POS/Facturas — reemplazar stock global por stock del almacén activo
    if (almacenId && data.length > 0) {
      const ids = data.map(p => p.id);
      const stocks = await this.stockAlmacenRepository.find({
        where: { productoId: In(ids), almacenId } as any,
      });
      const stockMap = new Map(stocks.map(s => [s.productoId, Number(s.stock)]));
      return {
        data: data.map(p => ({ ...p, stock: stockMap.get(p.id) ?? 0 })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Catálogo para el POS: los mismos productos que findAll(incluirSinStock),
   * pero SOLO con los campos que el POS realmente lee.
   *
   * Por qué existe: el POS carga el catálogo entero en memoria (es lo que hace
   * instantáneo el escaneo y la búsqueda local, y eso se queda). Lo que sobraba
   * era el peso por producto: findAll devolvía las 31 columnas de la entidad más
   * un `stockPorAlmacen` calculado con un JOIN triple sobre stock_almacen que el
   * POS no lee en ningún punto (cero referencias en POSPage.tsx). Medido en
   * producción: 688 bytes por producto → ~3,4 MB para un catálogo de 5 000, cada
   * 5 minutos y en cada terminal.
   *
   * Además dejan de salir `costo` y `costoPromedio`: son datos de margen y no
   * tenían por qué estar en la memoria de cada caja.
   *
   * Se devuelven productos sin stock a propósito (el cajero necesita verlos y
   * poder consultarlos); el stock exacto se valida al cobrar.
   */
  async catalogoPos() {
    const empresaId = this.tenantService.getEmpresaId();
    const almacenId = this.tenantService.getAlmacenId() ?? undefined;

    // Sin getManyAndCount: el POS no usa el total y el COUNT(*) repetiría el
    // mismo filtro sobre toda la tabla para nada.
    const data = await this.productoRepository
      .createQueryBuilder('p')
      .select([
        'p.id', 'p.nombre', 'p.codigo', 'p.codigoBarras',
        'p.precio', 'p.precio2', 'p.precio3',
        'p.stock', 'p.stockMinimo',
        'p.porcentajeIva', 'p.unidadMedida', 'p.categoria', 'p.tipo',
        'p.imagenUrl',          // ProductCard la pinta cuando existe
        'p.esPesable', 'p.plu', // balanza: procesarScan los necesita
      ])
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.isActive = :active', { active: true })
      .orderBy('p.nombre', 'ASC')
      .take(CATALOGO_POS_MAX)
      .getMany();

    // `p.stock` de la tabla productos es el GLOBAL (todos los almacenes). El POS
    // debe mostrar el del almacén de SU sucursal, o el badge miente en empresas
    // multi-sucursal. Una query por lote, sin N+1.
    //
    // Los servicios se dejan intactos: no tienen fila en stock_almacen y
    // ponerles 0 los marcaría como agotados.
    if (almacenId && data.length > 0) {
      const stocks = await this.stockAlmacenRepository.find({
        where: { productoId: In(data.map(p => p.id)), almacenId } as any,
      });
      const porProducto = new Map(stocks.map(s => [s.productoId, Number(s.stock)]));
      return {
        data: data.map(p =>
          p.tipo === 'servicio' ? p : { ...p, stock: porProducto.get(p.id) ?? 0 },
        ),
        meta: { total: data.length },
      };
    }

    return { data, meta: { total: data.length } };
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

    // null explícito = usuario quiere borrar el código → auto-generar uno nuevo
    if (dto.codigo === null) {
      const candidato = String(id).padStart(4, '0');
      const colision  = await this.productoRepository.findOne({ where: { codigo: candidato, empresaId, isActive: true } });
      dto.codigo = (colision && colision.id !== id) ? `${candidato}-${Date.now()}` : candidato;
    }
    // Sanitizar código: undefined/vacío/string-literal → undefined (no modificar el código existente)
    if (dto.codigo !== undefined && dto.codigo !== null && (!dto.codigo || !dto.codigo.trim())) {
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
        const key = await this.s3Service.uploadKey(
          buffer, `producto-${id}.${ext}`, mimetype,
          IMAGENES_FOLDER, empresaId,
        );
        if (key) dto.imagenUrl = key;
      } catch (err: unknown) {
        this.logger.warn(`Producto #${id}: base64 no subido a S3 — ${(err as Error).message}`);
      }
    }

    // stock se ignora en update — solo modificable mediante movimientos de inventario.
    // proveedorId y codigoProveedor tampoco son columnas de `productos`: van al par
    // en producto_proveedor, más abajo.
    const {
      almacenId,
      ubicacionId: ubicacionIdDto,
      stock: _stock,
      proveedorId,
      codigoProveedor,
      ...updateData
    } = dto as any;
    // Limpiar flag de creación rápida: cualquier edición manual del producto lo completa
    updateData.esCreacionRapida = false;

    // Validar unidad de medida si el producto es (o se está volviendo) pesable
    const efectivoEsPesable = updateData.esPesable !== undefined
      ? updateData.esPesable
      : producto.esPesable;
    if (efectivoEsPesable) {
      const efectivoUom = updateData.unidadMedida ?? producto.unidadMedida;
      await this.validarUnidadPesable(true, efectivoUom, empresaId);
    }

    await this.productoRepository.update(id, updateData);

    // Si viene ubicacionId, validar anti-IDOR y persistir en stock_almacen
    if (ubicacionIdDto !== undefined && almacenId) {
      const [ubic] = await this.productoRepository.manager.query<any[]>(
        `SELECT id FROM wms_ubicaciones WHERE id = $1 AND "almacenId" = $2 AND "empresaId" = $3 AND "isActive" = true LIMIT 1`,
        [ubicacionIdDto, almacenId, empresaId],
      );
      if (!ubic) throw new BadRequestException(`La ubicación #${ubicacionIdDto} no pertenece al almacén seleccionado`);
      await this.productoRepository.manager.query(
        `UPDATE stock_almacen SET "ubicacionId" = $1 WHERE "productoId" = $2 AND "almacenId" = $3 AND "empresaId" = $4`,
        [ubicacionIdDto || null, id, almacenId, empresaId],
      );
    }

    // Vincular al proveedor desde la EDICIÓN, no solo desde el alta: un producto
    // que ya existe también tiene que poder vincularse sin pasar por la pantalla
    // de reposición. Mismas reglas — opcional, precio nulo, preferente solo si no
    // hay ya uno activo — y tampoco lanza: la edición ya se guardó.
    //
    // No se DESVINCULA nada al dejar el Select vacío. Quitar un proveedor tiene
    // consecuencias (puede dejar al producto sin preferente) y su sitio es la
    // pantalla de reposición, donde se ve lo que se hace. Un formulario que borra
    // vínculos por omisión sería una trampa: bastaría guardar sin mirar el campo.
    if (proveedorId) {
      await this.productoProveedorSvc.vincularAlCrear(id, proveedorId, codigoProveedor);
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

    // Bloquear si tiene stock activo en algún almacén
    const stocksActivos = await this.stockAlmacenRepository.find({
      where: { productoId: id, empresaId },
      relations: ['almacen'],
    });
    const conStock = stocksActivos.filter(s => Number(s.stock) > 0);
    if (conStock.length > 0) {
      const detalle = conStock
        .map(s => `${Number(s.stock)} en "${s.almacen?.nombre ?? `almacén #${s.almacenId}`}"`)
        .join(', ');
      throw new BadRequestException(
        `No se puede eliminar "${producto.nombre}": tiene stock activo (${detalle}). Ajusta el inventario a 0 antes de eliminarlo.`,
      );
    }

    // Bloquear si está en órdenes de compra abiertas (borrador o enviada)
    const [{ count: ocCount }] = await this.productoRepository.manager.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM compra_detalles cd
       JOIN compras c ON c.id = cd."compraId"
       WHERE cd."productoId" = $1
         AND c."empresaId" = $2
         AND c.estado IN ('borrador', 'enviada')
         AND c."isActive" = true`,
      [id, empresaId],
    );
    const nOC = Number(ocCount);
    if (nOC > 0) {
      throw new BadRequestException(
        `No se puede eliminar "${producto.nombre}": está en ${nOC} orden${nOC !== 1 ? 'es' : ''} de compra abierta${nOC !== 1 ? 's' : ''}. Ciérrala${nOC !== 1 ? 's' : ''} o cancélala${nOC !== 1 ? 's' : ''} antes de eliminarlo.`,
      );
    }

    await this.productoRepository.update(id, { isActive: false });
    this.realtimeService.notify(empresaId, 'producto', 'deleted', id);
    return { message: `Producto "${producto.nombre}" eliminado` };
  }

  async historialCompras(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findOne(id); // 404 + anti-IDOR: verifica id + empresaId

    const rows: any[] = await this.productoRepository.manager.query(
      `SELECT
         prov.nombre            AS proveedor,
         c.folio,
         COALESCE(c."numeroFacturaProveedor", c.folio) AS "numeroDocumento",
         c.fecha                AS "fechaEmision",
         c."createdAt"          AS "fechaRegistro",
         cd.cantidad,
         cd."cantidadTotal",
         cd."costoUnitarioReal",
         c.moneda,
         c."tipoCambio",
         pr."unidadMedida",
         CASE WHEN e.id IS NOT NULL THEN 'FC' ELSE 'COM' END AS "tipoDocumento"
       FROM compra_detalles cd
       JOIN compras c    ON c.id       = cd."compraId"
       JOIN proveedores prov ON prov.id = c."proveedorId"
       JOIN productos pr ON pr.id      = cd."productoId"
       LEFT JOIN ecf e   ON e."documentoOrigenTipo" = 'COMPRA'
                         AND e."documentoOrigenId"  = c.id
                         AND e."empresaId"          = $2
                         AND e."isActive"           = true
       WHERE cd."productoId" = $1
         AND c."empresaId"   = $2
         AND c."isActive"    = true`,
      [id, empresaId],
    );

    if (rows.length === 0) return { resumen: null, lineas: [] };

    // Ordenar ASC por fecha para calcular tendencia cronológica
    const sorted = [...rows].sort((a, b) => {
      const da = new Date(a.fechaEmision).getTime();
      const db = new Date(b.fechaEmision).getTime();
      return da !== db ? da - db : new Date(a.fechaRegistro).getTime() - new Date(b.fechaRegistro).getTime();
    });

    const withTendencia = sorted.map((row, idx) => {
      const costoActual  = row.costoUnitarioReal != null ? Number(row.costoUnitarioReal) : null;
      const tipoCambio   = Number(row.tipoCambio ?? 1);
      let variacionPct: number | null = null;
      if (idx > 0) {
        const prevCosto = sorted[idx - 1].costoUnitarioReal != null ? Number(sorted[idx - 1].costoUnitarioReal) : null;
        if (prevCosto != null && prevCosto !== 0 && costoActual != null) {
          variacionPct = Math.round(((costoActual - prevCosto) / prevCosto) * 1000) / 10; // 1 decimal
        }
      }
      return {
        proveedor:              row.proveedor,
        tipoDocumento:          row.tipoDocumento,
        numeroDocumento:        row.numeroDocumento,
        fechaEmision:           row.fechaEmision,
        fechaRegistro:          row.fechaRegistro,
        cantidad:               Number(row.cantidad),
        cantidadTotal:          Number(row.cantidadTotal),
        costoUnitarioReal:      costoActual,
        moneda:                 row.moneda ?? 'DOP',
        tipoCambio,
        equivalenteMonedaLocal: costoActual != null ? Math.round(costoActual * tipoCambio * 100) / 100 : null,
        unidadMedida:           row.unidadMedida ?? '—',
        variacionPct,
      };
    });

    // Resultado en DESC (último primero)
    const lineas = withTendencia.reverse();

    // KPIs
    const ultima = lineas[0];
    const frecMap = new Map<string, number>();
    for (const l of lineas) frecMap.set(l.proveedor, (frecMap.get(l.proveedor) ?? 0) + 1);
    let maxFrec = 0, proveedorMasFrecuente = ultima.proveedor, comprasMasFrecuente = 1;
    for (const [prov, count] of frecMap) {
      if (count > maxFrec) { maxFrec = count; proveedorMasFrecuente = prov; comprasMasFrecuente = count; }
    }

    const primerCosto = sorted[0].costoUnitarioReal != null ? Number(sorted[0].costoUnitarioReal) : null;
    const ultimoCosto = sorted[sorted.length - 1].costoUnitarioReal != null ? Number(sorted[sorted.length - 1].costoUnitarioReal) : null;
    let variacionCostoTotal: number | null = null;
    if (primerCosto != null && primerCosto !== 0 && ultimoCosto != null) {
      variacionCostoTotal = Math.round(((ultimoCosto - primerCosto) / primerCosto) * 1000) / 10;
    }

    return {
      resumen: {
        ultimaCompra: { proveedor: ultima.proveedor, fecha: ultima.fechaEmision, costo: ultima.costoUnitarioReal, moneda: ultima.moneda },
        proveedorMasFrecuente: { nombre: proveedorMasFrecuente, compras: comprasMasFrecuente },
        variacionCostoTotal,
        totalLineas: lineas.length,
      },
      lineas,
    };
  }

  // ── Balanzas ──────────────────────────────────────────────────────────────

  /**
   * Valida que, si un producto es pesable, su unidad de medida sea una unidad
   * de peso con permiteDecimales = true.
   *
   * DEUDA TÉCNICA: productos.unidadMedida es VARCHAR libre — no hay FK a
   * unidades_medida. Hasta que se agregue la FK, esta validación hace la
   * consulta de forma manual. Si la unidad no existe en la tabla (unidades
   * creadas antes del módulo UOM) se permite el guardado con una advertencia
   * para no romper workflows existentes.
   */
  private async validarUnidadPesable(
    esPesable:     boolean,
    unidadMedida:  string,
    empresaId:     number,
  ): Promise<void> {
    if (!esPesable) return;

    const [fila] = await this.productoRepository.manager.query<any[]>(
      `SELECT codigo, "permiteDecimales", tipo
       FROM unidades_medida
       WHERE LOWER(codigo) = LOWER($1)
         AND "empresaId" = $2
         AND "isActive" = true
       LIMIT 1`,
      [unidadMedida, empresaId],
    );

    if (!fila) {
      // La unidad no está registrada en la tabla UOM — advertir pero no bloquear
      this.logger.warn(
        `esPesable=true: la unidad '${unidadMedida}' no existe en unidades_medida para empresa ${empresaId}. ` +
        'Verifique que sea una unidad de peso válida.',
      );
      return;
    }

    if (!fila.permiteDecimales || fila.tipo !== 'peso') {
      throw new BadRequestException(
        `La unidad '${unidadMedida}' no es válida para un producto pesable. ` +
        `Debe ser una unidad de tipo "peso" con permiteDecimales=true (ej. KG, LB, G).`,
      );
    }
  }

  // ── Ajuste de precios al público ───────────────────────────────────────────

  /**
   * PREVIEW del ajuste de precios al público. Solo lectura: calcula la propuesta
   * y no escribe nada.
   *
   * El conjunto se acota mediante uno o varios filtros combinables:
   *   - productoIds (selección manual — prioridad)
   *   - categoria / marca / busqueda
   *   - soloNoRedondos (post-filtro, libera el requisito de categoría/marca)
   *   - soloConExistencia / vendidosUltimosMeses (filtros de DB)
   *   - precioMin / precioMax (post-filtro por rango de precio final)
   *   - todoElCatalogo=true (opt-in explícito, nunca el default)
   *
   * Sin ningún filtro y sin todoElCatalogo, devuelve aviso sugiriendo
   * soloNoRedondos en vez de bloquear con un error.
   *
   * Cada fila incluye la verificación del despeje: si la base propuesta no
   * reproduce exactamente el precio objetivo, viene con verificado=false y su
   * motivo, y la UI la deja fuera de la selección.
   */
  async previewAjustePrecios(dto: PreviewAjustePreciosDto) {
    const empresaId = this.tenantService.getEmpresaId();

    const tieneFiltro =
      !!dto.productoIds?.length ||
      !!dto.categoria ||
      !!dto.marca ||
      !!dto.busqueda ||
      !!dto.soloNoRedondos ||
      !!dto.soloConExistencia ||
      !!dto.vendidosUltimosMeses ||
      dto.precioMin != null ||
      dto.precioMax != null ||
      dto.todoElCatalogo === true;

    if (!tieneFiltro) {
      return {
        filas: [], total: 0, conCambio: 0, excluidas: 0, esGrande: false,
        aviso:
          'Activa al menos un filtro. La opción más útil es "Precios no redondos" — ' +
          'selecciona automáticamente los productos cuyo precio al público tiene ' +
          'centavos, que es exactamente el conjunto que esta herramienta existe para ' +
          'arreglar. También puedes filtrar por categoría, marca, búsqueda, ' +
          'existencia o activar "Todo el catálogo" si quieres revisar todo.',
      };
    }

    const qb = this.productoRepository.createQueryBuilder('p')
      .where('p."empresaId" = :empresaId', { empresaId })
      .andWhere('p."isActive" = true')
      .andWhere('p.precio > 0');

    if (dto.productoIds?.length) {
      // Selección manual — ignora el resto de filtros de DB
      qb.andWhere('p.id IN (:...ids)', { ids: dto.productoIds });
    } else {
      if (dto.categoria) qb.andWhere('p.categoria = :categoria', { categoria: dto.categoria });
      if (dto.marca)     qb.andWhere('p.marca = :marca',         { marca: dto.marca });
      if (dto.busqueda) {
        const tokens = dto.busqueda.trim().split(/\s+/).filter(Boolean);
        tokens.forEach((token, i) => {
          const param = `busq${i}`;
          qb.andWhere(
            `(p.nombre ILIKE :${param} OR p.codigo ILIKE :${param})`,
            { [param]: `%${token}%` },
          );
        });
      }
      if (dto.soloConExistencia) {
        qb.andWhere('p.stock > 0');
      }
      if (dto.vendidosUltimosMeses) {
        const fechaVentaDesde = new Date();
        fechaVentaDesde.setMonth(fechaVentaDesde.getMonth() - dto.vendidosUltimosMeses);
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM factura_detalles fd
            JOIN facturas f ON f.id = fd."facturaId"
            WHERE fd."productoId" = p.id
              AND f."empresaId" = :empVentas
              AND f."isActive" = true
              AND f.fecha >= :fechaVentaDesde
          )`,
          { empVentas: empresaId, fechaVentaDesde },
        );
      }
    }

    const productos = await qb
      .select(['p.id', 'p.codigo', 'p.nombre', 'p.precio', 'p.precio2', 'p.precio3',
               'p.porcentajeIva', 'p.categoria', 'p.marca'])
      .orderBy('p.nombre', 'ASC')
      .getMany();

    const direccion    = dto.direccion ?? 'cercano';
    const soloConCambio = dto.soloConCambio !== false;

    let filas = productos.map(p => {
      const pctIva = Number(p.porcentajeIva ?? 0);
      const base   = calcularFila(Number(p.precio), pctIva, dto.modo, direccion);
      const p2 = p.precio2 != null && Number(p.precio2) > 0
        ? calcularFila(Number(p.precio2), pctIva, dto.modo, direccion) : null;
      const p3 = p.precio3 != null && Number(p.precio3) > 0
        ? calcularFila(Number(p.precio3), pctIva, dto.modo, direccion) : null;

      return {
        id: p.id, codigo: p.codigo, nombre: p.nombre,
        categoria: p.categoria, marca: p.marca, porcentajeIva: pctIva,
        ...base,
        precio2: p2, precio3: p3,
      };
    });

    // ── Post-filtros (dependen del cálculo) ──────────────────────────────────

    /** true si el precio al público actual tiene centavos — los "no redondos". */
    const tieneDecimales = (precioFinal: number) =>
      !Number.isInteger(Math.round(precioFinal * 100) / 100 * 1) ||
      Math.round(precioFinal) !== precioFinal;

    if (dto.soloNoRedondos) {
      filas = filas.filter(f => tieneDecimales(f.precioFinalActual));
    }
    if (dto.precioMin != null) {
      filas = filas.filter(f => f.precioFinalActual >= dto.precioMin!);
    }
    if (dto.precioMax != null) {
      filas = filas.filter(f => f.precioFinalActual <= dto.precioMax!);
    }

    const totalEnScope = filas.length;

    filas = filas
      .filter(f => !soloConCambio || f.diferencia !== 0 || f.precio2?.diferencia || f.precio3?.diferencia)
      // por desviación: primero lo que más se mueve
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

    return {
      filas,
      total:     totalEnScope,
      conCambio: filas.filter(f => f.verificado && f.diferencia !== 0).length,
      excluidas: filas.filter(f => !f.verificado).length,
      /** true cuando el conjunto supera 500 — la UI puede pedir confirmación extra al aplicar. */
      esGrande:  totalEnScope > 500,
    };
  }

  /**
   * Persiste el ajuste de precios aprobado en el preview.
   *
   * Seguridad: antes de tocar nada se verifica que cada id pertenezca a la
   * empresa del JWT. Cualquier id ajeno se descarta en silencio — no devuelve
   * error para no exponer el catálogo de otras empresas.
   */
  async aplicarAjustePrecios(dto: AplicarAjustePreciosDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const ids       = dto.filas.map(f => f.id);

    // Solo procesar ids que realmente pertenecen a esta empresa
    const existentes = await this.productoRepository
      .createQueryBuilder('p')
      .select('p.id')
      .where('p.id IN (:...ids)',           { ids })
      .andWhere('p."empresaId" = :eid',     { eid: empresaId })
      .andWhere('p."isActive" = true')
      .getMany();

    const idsSeguros  = new Set(existentes.map(p => p.id));
    const filasSeguras = dto.filas.filter(f => idsSeguros.has(f.id));

    if (filasSeguras.length === 0) return { actualizados: 0 };

    await this.productoRepository.manager.transaction(async em => {
      for (const fila of filasSeguras) {
        const patch: Partial<Producto> = { precio: fila.baseNueva };
        if (fila.precio2Nueva != null) patch.precio2 = fila.precio2Nueva;
        if (fila.precio3Nueva != null) patch.precio3 = fila.precio3Nueva;
        await em.update(Producto, { id: fila.id, empresaId }, patch);
      }
    });

    this.logger.log(
      `[ajustePrecios] aplicados ${filasSeguras.length} productos` +
      ` (solicitados ${dto.filas.length}) para empresa ${empresaId}`,
    );
    return { actualizados: filasSeguras.length };
  }
}
