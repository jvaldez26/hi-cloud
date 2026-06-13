import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { Almacen } from './entities/almacen.entity';
import { StockAlmacen } from './entities/stock-almacen.entity';
import { TransferenciaAlmacen, EstadoTransferencia } from './entities/transferencia.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Movimiento, TipoMovimiento } from '../inventario/entities/movimiento.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class AlmacenesService {
  private readonly logger = new Logger(AlmacenesService.name);

  constructor(
    @InjectRepository(Almacen)              private almRepo:  Repository<Almacen>,
    @InjectRepository(StockAlmacen)         private stockRepo: Repository<StockAlmacen>,
    @InjectRepository(TransferenciaAlmacen) private transRepo: Repository<TransferenciaAlmacen>,
    @InjectRepository(Producto)             private prodRepo:  Repository<Producto>,
    @InjectRepository(Movimiento)           private movRepo:   Repository<Movimiento>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ── Almacenes ─────────────────────────────────────────────────────────────

  async crear(dto: any) {
    return this.almRepo.save(this.almRepo.create({ ...dto, empresaId: this.tenantService.getEmpresaId() }));
  }

  async listar(sucursalId?: number) {
    const where: any = { isActive: true, activo: true, empresaId: this.tenantService.getEmpresaId() };
    if (sucursalId !== undefined) where.sucursalId = sucursalId;
    return this.almRepo.find({ where, order: { nombre: 'ASC' } });
  }

  async findById(id: number): Promise<Almacen> {
    const a = await this.almRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!a) throw new NotFoundException(`Almacén #${id} no encontrado`);
    return a;
  }

  async actualizar(id: number, dto: any) {
    await this.findById(id);
    await this.almRepo.update(id, dto);
    return this.findById(id);
  }

  async eliminar(id: number) {
    await this.findById(id);
    await this.almRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Stock por almacén ─────────────────────────────────────────────────────

  async getStockAlmacen(almacenId: number) {
    await this.findById(almacenId);
    return this.stockRepo.find({
      where: { almacenId, empresaId: this.tenantService.getEmpresaId(), isActive: true },
      relations: ['producto'],
      order: { producto: { nombre: 'ASC' } } as any,
    });
  }

  async getStockProducto(productoId: number) {
    return this.stockRepo.find({
      where: { productoId, empresaId: this.tenantService.getEmpresaId(), isActive: true },
      relations: ['almacen'],
    });
  }

  async actualizarStock(almacenId: number, productoId: number, cantidad: number) {
    let stock = await this.stockRepo.findOne({ where: { almacenId, productoId } });
    if (!stock) {
      stock = this.stockRepo.create({ almacenId, productoId, stock: 0 });
    }
    stock.stock = Math.max(0, Number(stock.stock) + cantidad);
    return this.stockRepo.save(stock);
  }

  // ── Resumen global ────────────────────────────────────────────────────────

  async getResumen() {
    const empresaId = this.tenantService.getEmpresaId();
    const almacenes = await this.listar();
    if (almacenes.length === 0) return [];

    const almacenIds = almacenes.map(a => a.id);
    const todosItems = await this.stockRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.producto', 'p')
      .where('s.almacenId IN (:...ids)', { ids: almacenIds })
      .andWhere('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = true')
      .getMany();

    const itemsByAlmacen = new Map<number, typeof todosItems>();
    for (const item of todosItems) {
      const list = itemsByAlmacen.get(item.almacenId) ?? [];
      list.push(item);
      itemsByAlmacen.set(item.almacenId, list);
    }

    return almacenes.map(alm => {
      const items = itemsByAlmacen.get(alm.id) ?? [];
      const totalProductos = items.length;
      const stockBajo  = items.filter(i => Number(i.stock) <= Number(i.stockMinimo)).length;
      const valorTotal = items.reduce(
        (s, i) => s + Number(i.stock) * Number((i as any).producto?.precio ?? 0), 0,
      );
      return { ...alm, totalProductos, stockBajo, valorTotal };
    });
  }

  // ── Transferencias ────────────────────────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource, 'transferencias_almacen', 'numero', '^TRF-[0-9]+$', 'TRF-', 1, empresaId,
    );
  }

  async crearTransferencia(dto: any, userId: number) {
    const [origen] = await Promise.all([
      this.findById(dto.almacenOrigenId),
      this.findById(dto.almacenDestinoId),
    ]);

    if (dto.almacenOrigenId === dto.almacenDestinoId) {
      throw new BadRequestException('El almacén origen y destino no pueden ser el mismo');
    }

    const stockOrigen = await this.stockRepo.findOne({
      where: { almacenId: dto.almacenOrigenId, productoId: dto.productoId },
    });

    if (!stockOrigen || Number(stockOrigen.stock) < Number(dto.cantidad)) {
      throw new BadRequestException(
        `Stock insuficiente en ${origen.nombre}. Disponible: ${stockOrigen?.stock ?? 0} unidades, Solicitado: ${dto.cantidad} unidades`,
      );
    }

    const numero = await this.generarNumero();
    return this.transRepo.save(this.transRepo.create({
      numero, ...dto,
      fecha:      new Date(dto.fecha ?? new Date()),
      estado:     EstadoTransferencia.PENDIENTE,
      empresaId:  this.tenantService.getEmpresaId(),
      usuarioId:  userId,
    }));
  }

  async listarTransferencias(page = 1, limit = 15, almacenId?: number) {
    const qb = this.transRepo.createQueryBuilder('t')
      .leftJoinAndSelect('t.almacenOrigen',  'ao')
      .leftJoinAndSelect('t.almacenDestino', 'ad')
      .leftJoinAndSelect('t.producto',       'p')
      .where('t.isActive = :a AND t.empresaId = :eid', { a: true, eid: this.tenantService.getEmpresaId() });

    if (almacenId) {
      qb.andWhere('(t.almacenOrigenId = :id OR t.almacenDestinoId = :id)', { id: almacenId });
    }

    const [data, total] = await qb
      .orderBy('t.fecha', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  /**
   * CONFIRMAR: PENDIENTE → EN_TRANSITO
   * Descuenta stock del almacén origen.
   * NO mueve al destino todavía.
   */
  async confirmarTransferencia(id: number, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const t = await this.transRepo.findOne({ where: { id, empresaId } });
    if (!t) throw new NotFoundException(`Transferencia #${id} no encontrada`);

    const esPendiente = t.estado === EstadoTransferencia.PENDIENTE
                     || t.estado === EstadoTransferencia.BORRADOR;
    if (!esPendiente) {
      throw new BadRequestException(
        `Solo se pueden confirmar transferencias Pendientes (estado actual: '${t.estado}')`,
      );
    }

    await this.dataSource.transaction(async (em) => {
      const stockRepo = em.getRepository(StockAlmacen);
      const transRepo = em.getRepository(TransferenciaAlmacen);
      const movRepo   = em.getRepository(Movimiento);

      // Re-validar stock al confirmar (puede haber cambiado desde la creación)
      const stockOrigen = await stockRepo.findOne({
        where: { almacenId: t.almacenOrigenId, productoId: t.productoId },
      });
      const cantAnterior = Number(stockOrigen?.stock ?? 0);

      if (cantAnterior < Number(t.cantidad)) {
        throw new BadRequestException(
          `Stock insuficiente en almacén #${t.almacenOrigenId}. Disponible: ${cantAnterior}, Solicitado: ${Number(t.cantidad)}`,
        );
      }

      // Descontar del origen
      await stockRepo.decrement(
        { almacenId: t.almacenOrigenId, productoId: t.productoId },
        'stock', Number(t.cantidad),
      );

      const cantNueva = cantAnterior - Number(t.cantidad);

      // Trazabilidad
      await movRepo.save(movRepo.create({
        tipo:             TipoMovimiento.SALIDA_TRANSFERENCIA,
        productoId:       t.productoId,
        cantidad:         Number(t.cantidad),
        cantidadAnterior: cantAnterior,
        cantidadNueva:    cantNueva,
        motivo:           `Transferencia ${t.numero}: almacén #${t.almacenOrigenId} → #${t.almacenDestinoId}`,
        referencia:       t.numero,
        userId,
        almacenId:        t.almacenOrigenId,
        empresaId,
      }));

      await transRepo.update(id, { estado: EstadoTransferencia.EN_TRANSITO });
    });

    return this.transRepo.findOne({ where: { id } }) as Promise<TransferenciaAlmacen>;
  }

  /**
   * RECIBIR: EN_TRANSITO → COMPLETADA
   * Suma stock al almacén destino.
   */
  async recibirTransferencia(id: number, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const t = await this.transRepo.findOne({ where: { id, empresaId } });
    if (!t) throw new NotFoundException(`Transferencia #${id} no encontrada`);

    if (t.estado !== EstadoTransferencia.EN_TRANSITO) {
      throw new BadRequestException(
        `Solo se pueden recibir transferencias En Tránsito (estado actual: '${t.estado}')`,
      );
    }

    await this.dataSource.transaction(async (em) => {
      const stockRepo = em.getRepository(StockAlmacen);
      const transRepo = em.getRepository(TransferenciaAlmacen);
      const movRepo   = em.getRepository(Movimiento);

      // Stock actual en destino antes de sumar
      const stockDestino = await stockRepo.findOne({
        where: { almacenId: t.almacenDestinoId, productoId: t.productoId },
      });
      const cantAnterior = Number(stockDestino?.stock ?? 0);
      const cantNueva    = cantAnterior + Number(t.cantidad);

      // Upsert stock en destino
      if (stockDestino) {
        await stockRepo.increment(
          { almacenId: t.almacenDestinoId, productoId: t.productoId },
          'stock', Number(t.cantidad),
        );
      } else {
        await stockRepo.save(stockRepo.create({
          almacenId:  t.almacenDestinoId,
          productoId: t.productoId,
          stock:      Number(t.cantidad),
          empresaId,
        }));
      }

      // Trazabilidad
      await movRepo.save(movRepo.create({
        tipo:             TipoMovimiento.ENTRADA_TRANSFERENCIA,
        productoId:       t.productoId,
        cantidad:         Number(t.cantidad),
        cantidadAnterior: cantAnterior,
        cantidadNueva:    cantNueva,
        motivo:           `Transferencia ${t.numero}: almacén #${t.almacenOrigenId} → #${t.almacenDestinoId}`,
        referencia:       t.numero,
        userId,
        almacenId:        t.almacenDestinoId,
        empresaId,
      }));

      await transRepo.update(id, { estado: EstadoTransferencia.COMPLETADA });
    });

    return this.transRepo.findOne({ where: { id } }) as Promise<TransferenciaAlmacen>;
  }

  /**
   * CANCELAR: PENDIENTE/EN_TRANSITO → CANCELADA
   * Si estaba EN_TRANSITO: devuelve stock al origen.
   */
  async cancelarTransferencia(id: number, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const t = await this.transRepo.findOne({ where: { id, empresaId } });
    if (!t) throw new NotFoundException(`Transferencia #${id} no encontrada`);

    if (t.estado === EstadoTransferencia.COMPLETADA) {
      throw new BadRequestException('No se puede cancelar una transferencia completada');
    }
    if (t.estado === EstadoTransferencia.CANCELADA) {
      throw new BadRequestException('La transferencia ya está cancelada');
    }

    if (t.estado === EstadoTransferencia.EN_TRANSITO) {
      // Revertir stock al origen
      await this.dataSource.transaction(async (em) => {
        const stockRepo = em.getRepository(StockAlmacen);
        const transRepo = em.getRepository(TransferenciaAlmacen);
        const movRepo   = em.getRepository(Movimiento);

        const stockOrigen = await stockRepo.findOne({
          where: { almacenId: t.almacenOrigenId, productoId: t.productoId },
        });
        const cantAnterior = Number(stockOrigen?.stock ?? 0);
        const cantNueva    = cantAnterior + Number(t.cantidad);

        await stockRepo.increment(
          { almacenId: t.almacenOrigenId, productoId: t.productoId },
          'stock', Number(t.cantidad),
        );

        await movRepo.save(movRepo.create({
          tipo:             TipoMovimiento.CANCELACION_TRANSFERENCIA,
          productoId:       t.productoId,
          cantidad:         Number(t.cantidad),
          cantidadAnterior: cantAnterior,
          cantidadNueva:    cantNueva,
          motivo:           `Cancelación ${t.numero} — stock revertido al origen (#${t.almacenOrigenId})`,
          referencia:       t.numero,
          userId,
          almacenId:        t.almacenOrigenId,
          empresaId,
        }));

        await transRepo.update(id, { estado: EstadoTransferencia.CANCELADA });
      });
    } else {
      // PENDIENTE/BORRADOR — sin movimiento de stock
      await this.transRepo.update(id, { estado: EstadoTransferencia.CANCELADA });
    }

    return { ok: true };
  }
}
