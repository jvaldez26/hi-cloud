import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PlanDemanda, EstadoPlan } from './entities/plan-demanda.entity';
import { PlanDemandaLinea, TendenciaProducto } from './entities/plan-demanda-linea.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class PlaneacionDemandaService {
  constructor(
    @InjectRepository(PlanDemanda)
    private planRepo: Repository<PlanDemanda>,
    @InjectRepository(PlanDemandaLinea)
    private lineaRepo: Repository<PlanDemandaLinea>,
    @InjectRepository(Producto)
    private productoRepo: Repository<Producto>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ── Numeración ──────────────────────────────────────────────────────────────
  private async nextNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const res = await this.planRepo
      .createQueryBuilder('p')
      .select(`MAX(CASE WHEN p.numero ~ '^PD-[0-9]+$' THEN CAST(SUBSTRING(p.numero FROM 4) AS INTEGER) ELSE 100 END)`, 'maxNum')
      .where('p.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();
    return `PD-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  // ── Análisis estadístico mensual desde facturas ────────────────────────────
  private async getVentasMensuales(
    empresaId: number,
    productoId: number,
    meses: number,
  ): Promise<Array<{ anio: number; mes: number; cantidad: number; monto: number }>> {
    const fechaDesde = new Date();
    fechaDesde.setMonth(fechaDesde.getMonth() - meses);
    const fechaDesdeStr = fechaDesde.toISOString().split('T')[0];

    const rows = await this.dataSource.query(`
      SELECT
        EXTRACT(YEAR FROM f.fecha)::INT  AS anio,
        EXTRACT(MONTH FROM f.fecha)::INT AS mes,
        COALESCE(SUM(fd.cantidad), 0)    AS cantidad,
        COALESCE(SUM(fd.total), 0)       AS monto
      FROM factura_detalles fd
      JOIN facturas f ON f.id = fd."facturaId"
      WHERE f."empresaId" = $1
        AND fd."productoId" = $2
        AND f.estado IN ('emitida', 'pagada')
        AND f.isActive = true
        AND f.fecha >= $3
      GROUP BY EXTRACT(YEAR FROM f.fecha), EXTRACT(MONTH FROM f.fecha)
      ORDER BY anio, mes
    `, [empresaId, productoId, fechaDesdeStr]);

    return rows.map((r: any) => ({
      anio:     Number(r.anio),
      mes:      Number(r.mes),
      cantidad: Number(r.cantidad),
      monto:    Number(r.monto),
    }));
  }

  // ── Calcular SMA (Simple Moving Average) ──────────────────────────────────
  private sma(datos: number[], ultimos: number): number {
    const slice = datos.slice(-ultimos);
    if (slice.length === 0) return 0;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  // ── Calcular tendencia (regresión lineal simple) ───────────────────────────
  private calcularTendencia(datos: number[]): { factor: number; tipo: TendenciaProducto } {
    if (datos.length < 3) return { factor: 1, tipo: TendenciaProducto.SIN_DATOS };

    const n = datos.length;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const sumX  = x.reduce((a, b) => a + b, 0);
    const sumY  = datos.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, xi, i) => a + xi * datos[i], 0);
    const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);

    const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const media     = sumY / n;

    // Factor de tendencia mensual
    const factor = media > 0 ? 1 + (pendiente / media) : 1;

    let tipo: TendenciaProducto;
    if (pendiente > media * 0.05)       tipo = TendenciaProducto.CRECIENTE;
    else if (pendiente < -media * 0.05) tipo = TendenciaProducto.DECRECIENTE;
    else                                tipo = TendenciaProducto.ESTABLE;

    return { factor: Math.max(0.1, Math.min(factor, 3)), tipo };
  }

  // ── Coeficiente de variación (estabilidad de la demanda) ──────────────────
  private coeficienteVariacion(datos: number[]): number {
    if (datos.length < 2) return 0;
    const media = datos.reduce((a, b) => a + b, 0) / datos.length;
    if (media === 0) return 0;
    const varianza = datos.reduce((a, x) => a + Math.pow(x - media, 2), 0) / datos.length;
    return Number(((Math.sqrt(varianza) / media) * 100).toFixed(1));
  }

  // ── Generar plan ───────────────────────────────────────────────────────────
  async generarPlan(dto: {
    horizonteMeses?: number;
    notas?: string;
    soloConVentas?: boolean;
  }) {
    const empresaId      = this.tenantService.getEmpresaId();
    const horizonte      = dto.horizonteMeses ?? 3;
    const numero         = await this.nextNumero();
    const hoy            = new Date();
    const periodoDesde   = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const fechaHasta     = new Date(hoy.getFullYear(), hoy.getMonth() + horizonte, 1);
    const periodoHasta   = `${fechaHasta.getFullYear()}-${String(fechaHasta.getMonth() + 1).padStart(2, '0')}`;

    const plan = await this.planRepo.save(
      this.planRepo.create({ numero, periodoDesde, periodoHasta, horizonteMeses: horizonte, notas: dto.notas, empresaId }),
    );

    // Obtener todos los productos activos
    const productos = await this.productoRepo.find({
      where: { empresaId, isActive: true },
      order: { nombre: 'ASC' },
    });

    const lineas: Partial<PlanDemandaLinea>[] = [];
    let conAlerta = 0;

    for (const prod of productos) {
      const hist12 = await this.getVentasMensuales(empresaId, prod.id, 12);
      const cantidades = hist12.map(h => h.cantidad);

      // Saltar productos sin ninguna venta si se pide solo con ventas
      if (dto.soloConVentas && cantidades.every(c => c === 0)) continue;

      const avg3  = this.sma(cantidades, 3);
      const avg6  = this.sma(cantidades, 6);
      const avg12 = this.sma(cantidades, 12);
      const { factor, tipo } = this.calcularTendencia(cantidades);
      const cv    = this.coeficienteVariacion(cantidades);
      const max   = cantidades.length > 0 ? Math.max(...cantidades) : 0;
      const min   = cantidades.length > 0 ? Math.min(...cantidades) : 0;

      // Proyección: SMA-3 ajustada por tendencia
      const base    = avg3 > 0 ? avg3 : avg6 > 0 ? avg6 : avg12;
      const proy1   = Number((base * factor).toFixed(4));
      const proy2   = Number((base * Math.pow(factor, 2)).toFixed(4));
      const proy3   = Number((base * Math.pow(factor, 3)).toFixed(4));
      const proyTot = Number((proy1 + proy2 + proy3).toFixed(4));

      const stockActual = Number(prod.stock ?? 0);
      const stockMin    = Number(prod.stockMinimo ?? 0);

      // Sugerencia de compra: si stock no cubre proyección del horizonte
      const deficit = proyTot - stockActual;
      const cantSugerida = deficit > 0 ? Number((deficit + stockMin).toFixed(4)) : 0;
      const requiereCompra = cantSugerida > 0;

      if (requiereCompra) conAlerta++;

      lineas.push({
        planId:                plan.id,
        productoId:            prod.id,
        ventaPromedio3m:       avg3,
        ventaPromedio6m:       avg6,
        ventaPromedio12m:      avg12,
        ventaMaximaMensual:    max,
        ventaMinimaMensual:    min,
        tendencia:             tipo,
        coeficienteVariacion:  cv,
        proyeccionMes1:        proy1,
        proyeccionMes2:        proy2,
        proyeccionMes3:        proy3,
        proyeccionTotal:       proyTot,
        stockActual,
        stockMinimo:           stockMin,
        cantidadSugeridaCompra: cantSugerida,
        requiereCompra,
        historicoMensual:      JSON.stringify(hist12),
        empresaId,
      });
    }

    if (lineas.length > 0) {
      await this.lineaRepo.save(this.lineaRepo.create(lineas));
    }

    await this.planRepo.update(plan.id, {
      totalProductos:    lineas.length,
      productosConAlerta: conAlerta,
    });

    return this.findPlanById(plan.id);
  }

  async getPlanes(page = 1, limit = 10) {
    const empresaId = this.tenantService.getEmpresaId();
    const [data, total] = await this.planRepo.findAndCount({
      where: { empresaId, isActive: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findPlanById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const plan = await this.planRepo.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!plan) throw new NotFoundException(`Plan #${id} no encontrado`);
    return plan;
  }

  async getLineasPlan(planId: number, soloAlertas = false) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findPlanById(planId);

    const qb = this.lineaRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.producto', 'p')
      .where('l.planId = :pid', { pid: planId })
      .andWhere('l.empresaId = :eid', { eid: empresaId })
      .andWhere('l.isActive = true');

    if (soloAlertas) qb.andWhere('l.requiereCompra = true');

    return qb.orderBy('l.cantidadSugeridaCompra', 'DESC').getMany();
  }

  async aprobarPlan(id: number) {
    const plan = await this.findPlanById(id);
    if (plan.estado !== EstadoPlan.BORRADOR) {
      throw new Error('Solo se pueden aprobar planes en borrador');
    }
    await this.planRepo.update(id, { estado: EstadoPlan.APROBADO });
    return this.findPlanById(id);
  }

  // ── Análisis rápido de un producto (sin guardar plan) ─────────────────────
  async analizarProducto(productoId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const producto  = await this.productoRepo.findOne({ where: { id: productoId, empresaId, isActive: true } });
    if (!producto) throw new NotFoundException(`Producto #${productoId} no encontrado`);

    const hist12  = await this.getVentasMensuales(empresaId, productoId, 24);
    const cantidades = hist12.map(h => h.cantidad);
    const { factor, tipo } = this.calcularTendencia(cantidades);

    return {
      producto: { id: producto.id, nombre: producto.nombre, codigo: producto.codigo, stock: producto.stock },
      historico: hist12,
      estadisticas: {
        promedio3m:  this.sma(cantidades, 3),
        promedio6m:  this.sma(cantidades, 6),
        promedio12m: this.sma(cantidades, 12),
        maximo:      Math.max(...cantidades, 0),
        minimo:      Math.min(...cantidades, 0),
        tendencia:   tipo,
        cv:          this.coeficienteVariacion(cantidades),
      },
      proyeccion: {
        mes1: Number((this.sma(cantidades, 3) * factor).toFixed(2)),
        mes2: Number((this.sma(cantidades, 3) * Math.pow(factor, 2)).toFixed(2)),
        mes3: Number((this.sma(cantidades, 3) * Math.pow(factor, 3)).toFixed(2)),
      },
    };
  }

  // ── Sugerencias de compra (productos que necesitan reposición) ────────────
  async getSugerencias(planId?: number) {
    const empresaId = this.tenantService.getEmpresaId();

    // Si no se da planId, usar el plan aprobado más reciente
    let targetPlanId = planId;
    if (!targetPlanId) {
      const ultimo = await this.planRepo.findOne({
        where: { empresaId, estado: EstadoPlan.APROBADO, isActive: true },
        order: { createdAt: 'DESC' },
      });
      if (!ultimo) {
        const borrador = await this.planRepo.findOne({
          where: { empresaId, isActive: true },
          order: { createdAt: 'DESC' },
        });
        targetPlanId = borrador?.id;
      } else {
        targetPlanId = ultimo.id;
      }
    }

    if (!targetPlanId) return { planId: null, sugerencias: [], totalSugerencias: 0 };

    const lineas = await this.getLineasPlan(targetPlanId, true);

    const sugerencias = lineas.map(l => ({
      productoId:    l.productoId,
      producto:      l.producto?.nombre,
      codigo:        l.producto?.codigo,
      stockActual:   Number(l.stockActual),
      stockMinimo:   Number(l.stockMinimo),
      proyeccion3m:  Number(l.proyeccionTotal),
      cantidadSugerida: Number(l.cantidadSugeridaCompra),
      tendencia:     l.tendencia,
      urgencia:      Number(l.stockActual) <= Number(l.stockMinimo) ? 'critica' :
                     Number(l.stockActual) < Number(l.proyeccionMes1) ? 'alta' : 'media',
    }));

    return { planId: targetPlanId, sugerencias, totalSugerencias: sugerencias.length };
  }
}
