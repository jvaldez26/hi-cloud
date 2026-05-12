import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Comision, EstadoComision } from './entities/comision.entity';
import { ReglaComision, TipoReglaComision } from './entities/regla-comision.entity';
import { Cron } from '@nestjs/schedule';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ComisionesService {
  private readonly logger = new Logger(ComisionesService.name);

  constructor(
    @InjectRepository(Comision)
    private repo: Repository<Comision>,
    @InjectRepository(ReglaComision)
    private reglaRepo: Repository<ReglaComision>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ── Reglas de Comisión ────────────────────────────────────────────────────

  async crearRegla(dto: {
    nombre: string; tipo: TipoReglaComision; porcentaje: number;
    prioridad?: number; vendedorId?: number; categoria?: string;
    montoDesde?: number; montoHasta?: number; diasMaximoCobro?: number;
    descripcion?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const regla = this.reglaRepo.create({ ...dto, empresaId, activa: true, prioridad: dto.prioridad ?? 100 });
    return this.reglaRepo.save(regla);
  }

  async getReglas() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.reglaRepo.find({
      where: { empresaId, isActive: true },
      order: { prioridad: 'ASC', tipo: 'ASC' },
    });
  }

  async updateRegla(id: number, dto: Partial<{ nombre: string; porcentaje: number; activa: boolean; prioridad: number; descripcion: string }>) {
    const empresaId = this.tenantService.getEmpresaId();
    const r = await this.reglaRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!r) throw new NotFoundException(`Regla #${id} no encontrada`);
    await this.reglaRepo.update(id, dto as any);
    return this.reglaRepo.findOne({ where: { id } });
  }

  async deleteRegla(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.reglaRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Regla eliminada' };
  }

  // ── Evaluación de regla aplicable ─────────────────────────────────────────

  private async evaluarRegla(
    vendedorId: number,
    totalVenta: number,
    categoriaProducto: string | null,
    diasPago: number | null,
    reglas: ReglaComision[],
    porcentajeDefault: number,
  ): Promise<{ porcentaje: number; reglaAplicada: string }> {
    const reglasActivas = reglas.filter(r => r.activa).sort((a, b) => a.prioridad - b.prioridad);

    for (const r of reglasActivas) {
      switch (r.tipo) {
        case TipoReglaComision.POR_VENDEDOR:
          if (r.vendedorId === vendedorId)
            return { porcentaje: Number(r.porcentaje), reglaAplicada: r.nombre };
          break;

        case TipoReglaComision.POR_CATEGORIA:
          if (r.categoria && categoriaProducto?.toLowerCase() === r.categoria.toLowerCase())
            return { porcentaje: Number(r.porcentaje), reglaAplicada: r.nombre };
          break;

        case TipoReglaComision.POR_MONTO:
          if (
            (r.montoDesde == null || totalVenta >= Number(r.montoDesde)) &&
            (r.montoHasta == null || totalVenta <= Number(r.montoHasta))
          ) return { porcentaje: Number(r.porcentaje), reglaAplicada: r.nombre };
          break;

        case TipoReglaComision.POR_ANTIGUEDAD:
          if (diasPago != null && r.diasMaximoCobro != null && diasPago <= r.diasMaximoCobro)
            return { porcentaje: Number(r.porcentaje), reglaAplicada: r.nombre };
          break;

        case TipoReglaComision.GLOBAL:
          return { porcentaje: Number(r.porcentaje), reglaAplicada: r.nombre };
      }
    }

    return { porcentaje: porcentajeDefault, reglaAplicada: 'Porcentaje base' };
  }

  // ── Calcular comisiones del período (con reglas avanzadas) ────────────────

  async calcularPeriodo(mes: number, anio: number, porcentajeBase = 5) {
    const empresaId = this.tenantService.getEmpresaId();
    const periodo   = `${anio}-${String(mes).padStart(2, '0')}`;

    // Cargar reglas activas de la empresa
    const reglas = await this.reglaRepo.find({ where: { empresaId, isActive: true }, order: { prioridad: 'ASC' } });

    // Facturas del período con info de vendedor y categoría de producto
    const rows = await this.dataSource.query<{
      vendedorId: number; vendedorNombre: string; facturaId: number;
      facturaFolio: string; total: string; fechaFactura: string;
      fechaPago: string | null; categoriaProducto: string | null;
    }[]>(`
      SELECT
        f."usuarioId"            AS "vendedorId",
        u.nombre                 AS "vendedorNombre",
        f.id                     AS "facturaId",
        f.folio                  AS "facturaFolio",
        f.total::text            AS total,
        f.fecha::text            AS "fechaFactura",
        f."fechaPago"::text      AS "fechaPago",
        (SELECT p.categoria FROM factura_detalles fd
          JOIN productos p ON p.id = fd."productoId"
          WHERE fd."facturaId" = f.id LIMIT 1) AS "categoriaProducto"
      FROM facturas f
      JOIN users u ON u.id = f."usuarioId"
      WHERE f."isActive" = true
        AND f.estado IN ('emitida','pagada')
        AND f."empresaId" = $1
        AND EXTRACT(MONTH FROM f.fecha) = $2
        AND EXTRACT(YEAR  FROM f.fecha) = $3
    `, [empresaId, mes, anio]);

    const resultados: any[] = [];
    let procesadas = 0;

    for (const r of rows) {
      const existe = await this.repo.findOne({ where: { facturaId: r.facturaId, empresaId } });
      if (existe) continue;

      const totalVenta = Number(r.total);

      // Días entre fecha factura y fecha pago (si ya está pagada)
      let diasPago: number | null = null;
      if (r.fechaPago) {
        const diff = new Date(r.fechaPago).getTime() - new Date(r.fechaFactura).getTime();
        diasPago = Math.round(diff / 86400000);
      }

      const { porcentaje, reglaAplicada } = await this.evaluarRegla(
        r.vendedorId, totalVenta, r.categoriaProducto, diasPago, reglas, porcentajeBase,
      );

      const montoComision = Number((totalVenta * porcentaje / 100).toFixed(2));

      await this.repo.save(this.repo.create({
        empresaId,
        vendedorId:         r.vendedorId,
        facturaId:          r.facturaId,
        facturaFolio:       r.facturaFolio,
        periodo,
        montoVenta:         totalVenta,
        porcentajeComision: porcentaje,
        montoComision,
        notas:              `Regla: ${reglaAplicada}`,
        userId:             r.vendedorId,
      }));

      resultados.push({
        vendedorId: r.vendedorId, vendedor: r.vendedorNombre,
        facturaFolio: r.facturaFolio, totalVenta, porcentaje,
        montoComision, reglaAplicada, diasPago,
      });
      procesadas++;
    }

    return { periodo, procesadas, resultados };
  }

  // ── Simulador de comisión ─────────────────────────────────────────────────

  async simular(dto: { vendedorId?: number; monto: number; categoria?: string; diasPago?: number }) {
    const empresaId = this.tenantService.getEmpresaId();
    const reglas    = await this.reglaRepo.find({ where: { empresaId, isActive: true }, order: { prioridad: 'ASC' } });
    const { porcentaje, reglaAplicada } = await this.evaluarRegla(
      dto.vendedorId ?? 0, dto.monto, dto.categoria ?? null, dto.diasPago ?? null, reglas, 5,
    );
    return {
      monto:         dto.monto,
      porcentaje,
      comision:      Number((dto.monto * porcentaje / 100).toFixed(2)),
      reglaAplicada,
    };
  }

  // ── CRUD estándar ─────────────────────────────────────────────────────────

  async listar(filtro: { periodo?: string; vendedorId?: number; estado?: EstadoComision }) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.repo.createQueryBuilder('c')
      .where('c.empresaId = :eid', { eid: empresaId })
      .orderBy('c.periodo', 'DESC').addOrderBy('c.vendedorId', 'ASC');

    if (filtro.periodo)    qb.andWhere('c.periodo = :p',     { p: filtro.periodo });
    if (filtro.vendedorId) qb.andWhere('c.vendedorId = :v',  { v: filtro.vendedorId });
    if (filtro.estado)     qb.andWhere('c.estado = :e',       { e: filtro.estado });

    return qb.getMany();
  }

  async aprobar(id: number) {
    const c = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
    if (!c) throw new NotFoundException(`Comisión #${id} no encontrada`);
    await this.repo.update(id, { estado: EstadoComision.APROBADA });
    return this.repo.findOne({ where: { id } });
  }

  async marcarPagada(id: number) {
    const c = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
    if (!c) throw new NotFoundException(`Comisión #${id} no encontrada`);
    await this.repo.update(id, { estado: EstadoComision.PAGADA, fechaPago: new Date() });
    return this.repo.findOne({ where: { id } });
  }

  async getResumenVendedor(vendedorId: number) {
    const rows = await this.dataSource.query<{
      periodo: string; totalVentas: string; montoComision: string; estado: string;
    }[]>(
      `SELECT periodo,
              COALESCE(SUM("montoVenta"), 0)::text    AS "totalVentas",
              COALESCE(SUM("montoComision"), 0)::text AS "montoComision",
              estado
       FROM comisiones WHERE "vendedorId" = $1
       GROUP BY periodo, estado ORDER BY periodo DESC LIMIT 12`,
      [vendedorId],
    );

    const totales = await this.dataSource.query<{ total: string; pagado: string; pendiente: string }[]>(
      `SELECT
         COALESCE(SUM("montoComision"), 0)::text AS total,
         COALESCE(SUM(CASE WHEN estado='pagada' THEN "montoComision" ELSE 0 END), 0)::text AS pagado,
         COALESCE(SUM(CASE WHEN estado NOT IN ('pagada','anulada') THEN "montoComision" ELSE 0 END), 0)::text AS pendiente
       FROM comisiones WHERE "vendedorId" = $1`,
      [vendedorId],
    );

    return {
      vendedorId,
      historico: rows,
      totales: {
        total:     Number(totales[0]?.total     ?? 0),
        pagado:    Number(totales[0]?.pagado    ?? 0),
        pendiente: Number(totales[0]?.pendiente ?? 0),
      },
    };
  }
}
