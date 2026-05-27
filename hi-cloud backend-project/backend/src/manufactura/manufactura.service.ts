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
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

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
    private asientosService: AsientosAutomaticosService,
  ) {}

  private async generarNumeroOrden(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource, 'ordenes_produccion', 'numero', '^OP-[0-9]+$', 'OP-', 1, empresaId,
    );
  }

  // ── Listas de Materiales (BOM) ────────────────────────────────────────────

  async crearLM(dto: any) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.lmRepo.findOne({ where: { codigo: dto.codigo, empresaId } });
    if (existe) throw new BadRequestException(`Código ${dto.codigo} ya existe`);
    return this.lmRepo.save(this.lmRepo.create({ ...dto, empresaId }));
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
    const empresaId = this.tenantService.getEmpresaId();
    const lm = await this.lmRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!lm) throw new NotFoundException(`Lista de materiales #${id} no encontrada`);
    await this.lmRepo.update(id, dto);
    return this.getLM(id);
  }

  async eliminarLM(id: number) {
    await this.lmRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Componentes ───────────────────────────────────────────────────────────

  async agregarComponente(listaId: number, dto: any) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.getLM(listaId);
    const total = await this.compRepo.count({ where: { listaId, empresaId, isActive: true } });
    return this.compRepo.save(this.compRepo.create({
      listaId, ...dto, empresaId, orden: dto.orden ?? total,
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

    if (estado === EstadoOrdenProduccion.EN_PROCESO) {
      await this._iniciarOrden(orden);
      return this.getOrden(id);
    }

    const update: any = { estado };
    if (estado === EstadoOrdenProduccion.CANCELADA) {
      update.fechaFinReal = new Date();
      await this.ordenRepo.update(id, update);
      await this._asientoRevertirInicio(orden);
      return this.getOrden(id);
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

    // Calcular costo real de MP consumida (usando costoPromedio de cada producto)
    let costoMP = 0;
    for (const c of comps) {
      const prod = prodMap.get(c.productoId);
      costoMP += Number(c.cantidad) * factor * Number(prod?.costoPromedio ?? 0);
    }

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
        costoReal:        Number(costoMP.toFixed(2)),
      });
    });

    this.logger.log(`Orden ${orden.numero} completada — ${cantidadProducida} unidades producidas`);

    // Asiento contable: WIP → Producto Terminado (fuera de la transacción de stock para no bloquearla)
    await this._asientoCompletarOrden(orden, cantidadProducida, costoMP);
  }

  /**
   * Asiento al INICIAR una orden: cambia estado a EN_PROCESO y registra asiento MP → WIP.
   * DEBE: 1.1.3.02 WIP (Productos en Proceso), HABER: 1.1.3.01 Inventario (MP)
   */
  private async _iniciarOrden(orden: any): Promise<void> {
    // Cambiar estado primero
    await this.ordenRepo.update(orden.id, { estado: EstadoOrdenProduccion.EN_PROCESO });

    // Calcular costo estimado de MP para el asiento
    const comps = await this.compRepo.find({ where: { listaId: orden.listaId, isActive: true } });
    if (comps.length === 0) return;

    const prodIds = comps.map((c: any) => c.productoId);
    const prods   = await this.prodRepo.find({ where: { id: In(prodIds) } });
    const prodMap = new Map(prods.map(p => [p.id, p]));

    const factor = Number(orden.cantidadPlanificada) / Number(orden.lista?.rendimiento ?? 1);
    const costoEstimado = comps.reduce((sum: number, c: any) => {
      const prod = prodMap.get(c.productoId);
      return sum + Number(c.cantidad) * factor * Number(prod?.costoPromedio ?? 0);
    }, 0);

    if (costoEstimado <= 0) {
      this.logger.warn(`Orden ${orden.numero}: costo estimado MP = 0 — se omite asiento de inicio`);
      return;
    }

    const userId = this.tenantService.getUserId() ?? 0;
    const empresaId = this.tenantService.getEmpresaId();

    try {
      const asiento = await this.asientosService.crearAsientoContabilizado({
        descripcion:     `Traslado MP a WIP - Orden ${orden.numero}`,
        tipoOrigen:      TipoOrigenAsiento.MANUFACTURA,
        referenciaId:    orden.id,
        referenciaFolio: orden.numero,
        userId,
        lineas: [
          { codigo: '1.1.3.02', descripcion: `WIP Orden ${orden.numero}`,           debe: costoEstimado, haber: 0             },
          { codigo: '1.1.3.01', descripcion: `Consumo MP Orden ${orden.numero}`,    debe: 0,             haber: costoEstimado },
        ],
      });
      if (asiento?.id) {
        await this.ordenRepo.update(orden.id, { asientoInicioId: asiento.id });
        this.logger.log(`Asiento inicio Orden ${orden.numero} — id=${asiento.id} — monto=${costoEstimado.toFixed(2)}`);
      }
    } catch (err: any) {
      this.logger.warn(`No se pudo crear asiento de inicio para Orden ${orden.numero}: ${err?.message}`);
    }
  }

  /**
   * Asiento al COMPLETAR una orden: WIP → Producto Terminado.
   * DEBE: 1.1.3.03 Productos Terminados, HABER: 1.1.3.02 WIP
   * Si hay costo de mano de obra (centros de trabajo), se agrega HABER: 6.1.1.01 MOD.
   */
  private async _asientoCompletarOrden(orden: any, cantidadProducida: number, costoMP: number): Promise<void> {
    if (costoMP <= 0) {
      this.logger.warn(`Orden ${orden.numero}: costo MP = 0 — se omite asiento de cierre`);
      return;
    }

    // Calcular costo de mano de obra directa (MOD) desde centros de trabajo
    let costoMOD = 0;
    try {
      const etapas: Array<{ tiempoRealHoras: number; costoHora: number }> = await this.dataSource.query(
        `SELECT
           COALESCE(EXTRACT(EPOCH FROM (re."fechaFin" - re."fechaInicio")) / 3600, 0) AS "tiempoRealHoras",
           COALESCE(ct."costoHora", 0) AS "costoHora"
         FROM registro_etapas_orden re
         LEFT JOIN etapas_ruta er ON er.id = re."etapaId"
         LEFT JOIN centros_trabajo ct ON ct.id = er."centroTrabajoId"
         WHERE re."ordenId" = $1
           AND re."estado" = 'completada'`,
        [orden.id],
      );
      costoMOD = etapas.reduce(
        (sum, e) => sum + Number(e.tiempoRealHoras) * Number(e.costoHora),
        0,
      );
    } catch (err: any) {
      this.logger.warn(`No se pudo calcular MOD para Orden ${orden.numero}: ${err?.message}`);
    }

    const costoTotal = costoMP + costoMOD;
    const userId     = this.tenantService.getUserId() ?? 0;

    try {
      const lineas: Array<{ codigo: string; descripcion: string; debe: number; haber: number }> = [
        { codigo: '1.1.3.03', descripcion: `PT Orden ${orden.numero} — ${cantidadProducida} und.`, debe: costoTotal, haber: 0       },
        { codigo: '1.1.3.02', descripcion: `WIP liberado Orden ${orden.numero}`,                   debe: 0,          haber: costoMP  },
      ];

      if (costoMOD > 0) {
        lineas.push({ codigo: '6.1.1.01', descripcion: `MOD aplicada Orden ${orden.numero}`, debe: 0, haber: costoMOD });
      }

      const asiento = await this.asientosService.crearAsientoContabilizado({
        descripcion:     `Producción completada - Orden ${orden.numero} - ${cantidadProducida} unidades`,
        tipoOrigen:      TipoOrigenAsiento.MANUFACTURA,
        referenciaId:    orden.id,
        referenciaFolio: orden.numero,
        userId,
        lineas,
      });
      if (asiento?.id) {
        await this.ordenRepo.update(orden.id, { asientoFinId: asiento.id });
        this.logger.log(`Asiento cierre Orden ${orden.numero} — id=${asiento.id} — costoTotal=${costoTotal.toFixed(2)}`);
      }
    } catch (err: any) {
      this.logger.warn(`No se pudo crear asiento de cierre para Orden ${orden.numero}: ${err?.message}`);
    }
  }

  /**
   * Asiento de reversión al cancelar una orden en proceso: WIP → MP.
   * DEBE: 1.1.3.01 Inventario (MP), HABER: 1.1.3.02 WIP
   * Solo aplica si ya se generó asiento de inicio.
   */
  private async _asientoRevertirInicio(orden: any): Promise<void> {
    if (!orden.asientoInicioId) return;

    // Buscar el monto del asiento original para reversarlo
    let montoOriginal = 0;
    try {
      const rows: Array<{ totalDebe: string }> = await this.dataSource.query(
        `SELECT "totalDebe" FROM asientos_contables WHERE id = $1 LIMIT 1`,
        [orden.asientoInicioId],
      );
      montoOriginal = rows.length > 0 ? Number(rows[0].totalDebe) : 0;
    } catch (err: any) {
      this.logger.warn(`No se pudo leer asiento de inicio para Orden ${orden.numero}: ${err?.message}`);
      return;
    }

    if (montoOriginal <= 0) return;

    const userId = this.tenantService.getUserId() ?? 0;

    try {
      await this.asientosService.crearAsientoContabilizado({
        descripcion:     `Reversión cancelación - Orden ${orden.numero}`,
        tipoOrigen:      TipoOrigenAsiento.MANUFACTURA,
        referenciaId:    orden.id,
        referenciaFolio: orden.numero,
        userId,
        lineas: [
          { codigo: '1.1.3.01', descripcion: `Devolución MP Orden ${orden.numero}`, debe: montoOriginal, haber: 0             },
          { codigo: '1.1.3.02', descripcion: `WIP reversado Orden ${orden.numero}`, debe: 0,             haber: montoOriginal },
        ],
      });
      this.logger.log(`Asiento reversión Orden ${orden.numero} — monto=${montoOriginal.toFixed(2)}`);
    } catch (err: any) {
      this.logger.warn(`No se pudo crear asiento de reversión para Orden ${orden.numero}: ${err?.message}`);
    }
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
    const empresaId = this.tenantService.getEmpresaId();
    const [borrador, planificadas, enProceso, completadas, canceladas] = await Promise.all([
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoOrdenProduccion.BORRADOR } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoOrdenProduccion.PLANIFICADA } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoOrdenProduccion.EN_PROCESO } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoOrdenProduccion.COMPLETADA } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoOrdenProduccion.CANCELADA } }),
    ]);

    const totalLM = await this.lmRepo.count({ where: { isActive: true, empresaId, activa: true } });

    return { borrador, planificadas, enProceso, completadas, canceladas, totalLM };
  }
}
