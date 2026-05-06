import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Almacen } from './entities/almacen.entity';
import { StockAlmacen } from './entities/stock-almacen.entity';
import { TransferenciaAlmacen, EstadoTransferencia } from './entities/transferencia.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class AlmacenesService {
  constructor(
    @InjectRepository(Almacen)              private almRepo:  Repository<Almacen>,
    @InjectRepository(StockAlmacen)         private stockRepo: Repository<StockAlmacen>,
    @InjectRepository(TransferenciaAlmacen) private transRepo: Repository<TransferenciaAlmacen>,
    @InjectRepository(Producto)             private prodRepo:  Repository<Producto>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ── Almacenes ─────────────────────────────────────────────────────────────

  async crear(dto: any) {
    return this.almRepo.save(this.almRepo.create(dto));
  }

  async listar() {
    return this.almRepo.find({ where: { isActive: true, activo: true }, order: { nombre: 'ASC' } });
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
    const almacenes = await this.listar();
    const resultado = await Promise.all(almacenes.map(async (alm) => {
      const items = await this.stockRepo.find({ where: { almacenId: alm.id, isActive: true } });
      const totalProductos = items.length;
      const stockBajo = items.filter(i => Number(i.stock) <= Number(i.stockMinimo)).length;
      const valorTotal = items.reduce((s, i) => s + Number(i.stock) * Number(i.producto?.['precio'] ?? 0), 0);
      return { ...alm, totalProductos, stockBajo, valorTotal };
    }));
    return resultado;
  }

  // ── Transferencias ────────────────────────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const n    = new Date();
    const yymm = `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `TRF-${yymm}-`;
    const res  = await this.transRepo
      .createQueryBuilder('t')
      .select(`MAX(CAST(SPLIT_PART(t.numero, '-', 3) AS INTEGER))`, 'maxNum')
      .where('t.numero LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ maxNum: number | null }>();
    return `${prefix}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;
  }

  async crearTransferencia(dto: any, userId: number) {
    const [origen, destino] = await Promise.all([
      this.findById(dto.almacenOrigenId),
      this.findById(dto.almacenDestinoId),
    ]);

    if (dto.almacenOrigenId === dto.almacenDestinoId) {
      throw new BadRequestException('El almacén origen y destino no pueden ser el mismo');
    }

    const stockOrigen = await this.stockRepo.findOne({
      where: { almacenId: dto.almacenOrigenId, productoId: dto.productoId },
    });

    if (!stockOrigen || Number(stockOrigen.stock) < dto.cantidad) {
      throw new BadRequestException(
        `Stock insuficiente en ${origen.nombre}: disponible=${stockOrigen?.stock ?? 0}, requerido=${dto.cantidad}`,
      );
    }

    const numero = await this.generarNumero();
    return this.transRepo.save(this.transRepo.create({
      numero, ...dto,
      fecha:     new Date(dto.fecha ?? new Date()),
      estado:    EstadoTransferencia.BORRADOR,
      usuarioId: userId,
    }));
  }

  async listarTransferencias(page = 1, limit = 15, almacenId?: number) {
    const qb = this.transRepo.createQueryBuilder('t')
      .leftJoinAndSelect('t.almacenOrigen',  'ao')
      .leftJoinAndSelect('t.almacenDestino', 'ad')
      .leftJoinAndSelect('t.producto',       'p')
      .where('t.isActive = :a', { a: true });

    if (almacenId) {
      qb.andWhere('(t.almacenOrigenId = :id OR t.almacenDestinoId = :id)', { id: almacenId });
    }

    const [data, total] = await qb
      .orderBy('t.fecha', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async confirmarTransferencia(id: number) {
    const t = await this.transRepo.findOne({ where: { id }, relations: ['producto'] });
    if (!t) throw new NotFoundException(`Transferencia #${id} no encontrada`);
    if (t.estado !== EstadoTransferencia.BORRADOR) {
      throw new BadRequestException(`La transferencia ya está ${t.estado}`);
    }

    await this.dataSource.transaction(async (em) => {
      const stockRepo = em.getRepository(StockAlmacen);
      const transRepo = em.getRepository(TransferenciaAlmacen);

      // Descontar del origen
      await stockRepo.decrement(
        { almacenId: t.almacenOrigenId, productoId: t.productoId },
        'stock', Number(t.cantidad),
      );

      // Incrementar en destino (upsert)
      const dest = await stockRepo.findOne({ where: { almacenId: t.almacenDestinoId, productoId: t.productoId } });
      if (dest) {
        await stockRepo.increment(
          { almacenId: t.almacenDestinoId, productoId: t.productoId },
          'stock', Number(t.cantidad),
        );
      } else {
        await stockRepo.save(stockRepo.create({
          almacenId:  t.almacenDestinoId,
          productoId: t.productoId,
          stock:      Number(t.cantidad),
        }));
      }

      await transRepo.update(id, { estado: EstadoTransferencia.COMPLETADA });
    });

    return this.transRepo.findOne({ where: { id } }) as Promise<TransferenciaAlmacen>;
  }

  async cancelarTransferencia(id: number) {
    const t = await this.transRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException();
    if (t.estado === EstadoTransferencia.COMPLETADA)
      throw new BadRequestException('No se puede cancelar una transferencia completada');
    await this.transRepo.update(id, { estado: EstadoTransferencia.CANCELADA });
    return { ok: true };
  }
}
