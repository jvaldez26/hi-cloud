import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { ListaMateriales } from './entities/lista-materiales.entity';
import { ComponenteLM } from './entities/componente-lm.entity';
import { OrdenProduccion, EstadoOrdenProduccion } from './entities/orden-produccion.entity';
import { Producto } from '../productos/entities/producto.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

@Injectable()
export class ManufacturaService {
  private readonly logger = new Logger(ManufacturaService.name);

  constructor(
    @InjectRepository(ListaMateriales) private lmRepo:     Repository<ListaMateriales>,
    @InjectRepository(ComponenteLM)    private compRepo:   Repository<ComponenteLM>,
    @InjectRepository(OrdenProduccion) private ordenRepo:  Repository<OrdenProduccion>,
    @InjectRepository(Producto)        private prodRepo:   Repository<Producto>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  private async generarNumeroOrden(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource, 'ordenes_produccion', 'numero', '^OP-[0-9]+$', 'OP-', 1, empresaId,
    );
  }

  // ── Listas de Materiales (BOM) ────────────────────────────────────────────

  async crearLM(dto: any) {
    const existe = await this.lmRepo.findOne({ where: { codigo: dto.codigo } });
    if (existe) throw new BadRequestException(`Código ${dto.codigo} ya existe`);
    return this.lmRepo.save(this.lmRepo.create(dto));
  }

  async listarLM() {
    return this.lmRepo.find({ where: { empresaId: this.tenantService.getEmpresaId(), isActive: true }, order: { codigo: 'ASC' } });
  }

  async getLM(id: number) {
    const lm = await this.lmRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!lm) throw new NotFoundException(`Lista de materiales #${id} no encontrada`);

    const componentes = await this.compRepo.find({
      where: { listaId: id, isActive: true },
      order: { orden: 'ASC' },
    });

    // Una sola query para todos los productos — elimina N+1
    const prodIds   = [...new Set([lm.productoFinalId, ...componentes.map(c => c.productoId)])];
    const productos = await this.prodRepo.find({ where: { id: In(prodIds) } });
    const prodMap   = new Map(productos.map(p => [p.id, p]));

    const productoFinal    = prodMap.get(lm.productoFinalId);
    const compsEnriquecidos = componentes.map(c => {
      const prod = prodMap.get(c.productoId);
      return { ...c, producto: { id: prod?.id, codigo: prod?.codigo, nombre: prod?.nombre, stock: prod?.stock, precio: prod?.precio } };
    });
    const costoEstimado = compsEnriquecidos.reduce((s, c) =>
      s + Number(c.producto?.precio ?? 0) * Number(c.cantidad), 0);

    return { ...lm, productoFinal, componentes: compsEnriquecidos, costoEstimado };
  }

  async actualizarLM(id: number, dto: any) {
    await this.lmRepo.findOne({ where: { id } });
    await this.lmRepo.update(id, dto);
    return this.getLM(id);
  }

  async eliminarLM(id: number) {
    await this.lmRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Componentes ───────────────────────────────────────────────────────────

  async agregarComponente(listaId: number, dto: any) {
    await this.getLM(listaId);
    const total = await this.compRepo.count({ where: { listaId, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    return this.compRepo.save(this.compRepo.create({
      listaId, ...dto, orden: dto.orden ?? total,
    }));
  }

  async actualizarComponente(id: number, dto: any) {
    await this.compRepo.update(id, dto);
    return this.compRepo.findOne({ where: { id } });
  }

  async eliminarComponente(id: number) {
    await this.compRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Órdenes de producción ─────────────────────────────────────────────────

  async crearOrden(dto: any) {
    await this.getLM(dto.listaId);
    const numero = await this.generarNumeroOrden();
    return this.ordenRepo.save(this.ordenRepo.create({
      empresaId: this.tenantService.getEmpresaId(),
      ...dto,
      numero,
      fechaInicio:          new Date(dto.fechaInicio),
      fechaFinPlanificada:  dto.fechaFinPlanificada ? new Date(dto.fechaFinPlanificada) : undefined,
    }));
  }

  async listarOrdenes(pagination: PaginationDto, estado?: string) {
    const { limit = 10, page = 1 } = pagination;
    const qb = this.ordenRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.lista', 'l')
      .where('o.isActive = true AND o.empresaId = :eid', { eid: this.tenantService.getEmpresaId() });

    if (estado) qb.andWhere('o.estado = :e', { e: estado });

    const [data, total] = await qb
      .orderBy('o.fechaInicio', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async getOrden(id: number) {
    const o = await this.ordenRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true }, relations: ['lista'] });
    if (!o) throw new NotFoundException(`Orden #${id} no encontrada`);

    // Calcular consumos planificados
    const componentes = await this.compRepo.find({
      where: { listaId: o.listaId, isActive: true },
      order: { orden: 'ASC' },
    });

    // Una sola query para todos los productos de los componentes — elimina N+1
    const prodIds = componentes.map(c => c.productoId);
    const prods   = prodIds.length > 0
      ? await this.prodRepo.find({ where: { id: In(prodIds) } })
      : [];
    const prodMap = new Map(prods.map(p => [p.id, p]));

    const factor  = Number(o.cantidadPlanificada) / Number(o.lista.rendimiento);
    const consumos = componentes.map(c => {
      const prod      = prodMap.get(c.productoId);
      const requerido = Number(c.cantidad) * factor;
      return {
        productoId:   c.productoId,
        nombre:       prod?.nombre ?? '—',
        codigo:       prod?.codigo ?? '—',
        unidad:       c.unidad,
        requerido,
        disponible:   Number(prod?.stock ?? 0),
        suficiente:   Number(prod?.stock ?? 0) >= requerido,
      };
    });

    return { ...o, consumos };
  }

  async cambiarEstado(id: number, estado: EstadoOrdenProduccion, cantidadProducida?: number) {
    const orden = await this.getOrden(id);

    if (estado === EstadoOrdenProduccion.COMPLETADA) {
      await this._completarOrden(orden, cantidadProducida ?? Number(orden.cantidadPlanificada));
      return this.getOrden(id);
    }

    const update: any = { estado };
    if (estado === EstadoOrdenProduccion.CANCELADA) {
      update.fechaFinReal = new Date();
    }
    await this.ordenRepo.update(id, update);
    return this.getOrden(id);
  }

  private async _completarOrden(orden: any, cantidadProducida: number) {
    const factor = cantidadProducida / Number(orden.lista.rendimiento);
    const comps  = await this.compRepo.find({ where: { listaId: orden.listaId, isActive: true } });

    // Cargar todos los productos en una sola query — sin N+1
    const prodIds = [...new Set([orden.lista.productoFinalId, ...comps.map((c: any) => c.productoId)])];
    const prods   = await this.prodRepo.find({ where: { id: In(prodIds) } });
    const prodMap = new Map(prods.map(p => [p.id, p]));

    // Transacción atómica: todos los movimientos de stock o ninguno
    await this.dataSource.transaction(async (em) => {
      const prodRepo  = em.getRepository(Producto);
      const ordenRepo = em.getRepository(OrdenProduccion);

      for (const c of comps) {
        const prod = prodMap.get(c.productoId);
        if (!prod) continue;
        const consumo    = Number(c.cantidad) * factor;
        const nuevoStock = Number(prod.stock) - consumo;
        if (nuevoStock < 0) {
          this.logger.warn(`Stock insuficiente de ${prod.nombre}: disponible=${prod.stock}, requerido=${consumo}`);
        }
        await prodRepo.update(c.productoId, { stock: Math.max(0, nuevoStock) });
      }

      const pFinal = prodMap.get(orden.lista.productoFinalId);
      if (pFinal) {
        await prodRepo.update(pFinal.id, { stock: Number(pFinal.stock) + cantidadProducida });
      }

      await ordenRepo.update(orden.id, {
        estado:           EstadoOrdenProduccion.COMPLETADA,
        cantidadProducida,
        fechaFinReal:     new Date(),
      });
    });

    this.logger.log(`Orden ${orden.numero} completada — ${cantidadProducida} unidades producidas`);
  }

  async eliminarOrden(id: number) {
    const o = await this.ordenRepo.findOne({ where: { id } });
    if (!o) throw new NotFoundException();
    if (o.estado === EstadoOrdenProduccion.EN_PROCESO) {
      throw new BadRequestException('No se puede eliminar una orden en proceso');
    }
    await this.ordenRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Dashboard manufactura ─────────────────────────────────────────────────

  async getDashboard() {
    const [borrador, planificadas, enProceso, completadas, canceladas] = await Promise.all([
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoOrdenProduccion.BORRADOR } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoOrdenProduccion.PLANIFICADA } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoOrdenProduccion.EN_PROCESO } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoOrdenProduccion.COMPLETADA } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoOrdenProduccion.CANCELADA } }),
    ]);

    const totalLM = await this.lmRepo.count({ where: { isActive: true, activa: true } });

    return { borrador, planificadas, enProceso, completadas, canceladas, totalLM };
  }
}
