import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Comision, EstadoComision } from './entities/comision.entity';
import { Cron } from '@nestjs/schedule';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ComisionesService {
  private readonly logger = new Logger(ComisionesService.name);

  constructor(
    @InjectRepository(Comision)
    private repo: Repository<Comision>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ── Calcular comisiones de un período ──────────────────────────────────────

  async calcularPeriodo(mes: number, anio: number, porcentaje = 5) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

    // Facturas emitidas/pagadas del período por vendedor
    const rows = await this.dataSource.query<{
      vendedorId: number; vendedorNombre: string;
      totalVentas: string; cantidadFacturas: string;
    }[]>(
      `SELECT f."usuarioId" AS "vendedorId",
              u.nombre AS "vendedorNombre",
              COALESCE(SUM(f.total), 0)::text AS "totalVentas",
              COUNT(f.id)::text AS "cantidadFacturas"
       FROM facturas f
       JOIN users u ON u.id = f."usuarioId"
       WHERE f."isActive" = true
         AND f.estado IN ('emitida','pagada')
         AND EXTRACT(MONTH FROM f.fecha) = $1
         AND EXTRACT(YEAR  FROM f.fecha) = $2
       GROUP BY f."usuarioId", u.nombre`,
      [mes, anio],
    );

    const resultados: Array<{ vendedorId: number; vendedor: string; totalVentas: number; cantidadFacturas: number; porcentaje: number; comision: number; periodo: string }> = [];
    for (const r of rows) {
      const total      = Number(r.totalVentas);
      const comision   = Number((total * porcentaje / 100).toFixed(2));

      // No duplicar si ya existe para este vendedor/período
      const existe = await this.repo.findOne({
        where: { vendedorId: r.vendedorId, periodo, empresaId: this.tenantService.getEmpresaId() },
      });

      if (!existe) {
        await this.repo.save(this.repo.create({
          empresaId:          this.tenantService.getEmpresaId(),
          vendedorId:         r.vendedorId,
          periodo,
          montoVenta:         total,
          porcentajeComision: porcentaje,
          montoComision:      comision,
          userId:             r.vendedorId,
        }));
      }

      resultados.push({
        vendedorId:    r.vendedorId,
        vendedor:      r.vendedorNombre,
        totalVentas:   total,
        cantidadFacturas: Number(r.cantidadFacturas),
        porcentaje,
        comision,
        periodo,
      });
    }

    return { periodo, resultados };
  }

  async listar(filtro: { periodo?: string; vendedorId?: number; estado?: EstadoComision }) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.repo.createQueryBuilder('c').where('c.empresaId = :eid', { eid: empresaId })
      .orderBy('c.periodo', 'DESC').addOrderBy('c.vendedorId', 'ASC');

    if (filtro.periodo)    qb.where('c.periodo = :p',  { p: filtro.periodo });
    if (filtro.vendedorId) qb.andWhere('c.vendedorId = :v', { v: filtro.vendedorId });
    if (filtro.estado)     qb.andWhere('c.estado = :e',   { e: filtro.estado });

    return qb.getMany();
  }

  async aprobar(id: number) {
    const c = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
    if (!c) throw new NotFoundException(`Comisión #${id} no encontrada`);
    await this.repo.update(id, { estado: EstadoComision.APROBADA });
    return this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
  }

  async marcarPagada(id: number) {
    const c = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
    if (!c) throw new NotFoundException(`Comisión #${id} no encontrada`);
    await this.repo.update(id, {
      estado:    EstadoComision.PAGADA,
      fechaPago: new Date(),
    });
    return this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
  }

  async getResumenVendedor(vendedorId: number) {
    const rows = await this.dataSource.query<{
      periodo: string; totalVentas: string; montoComision: string; estado: string;
    }[]>(
      `SELECT periodo,
              COALESCE(SUM("montoVenta"), 0)::text AS "totalVentas",
              COALESCE(SUM("montoComision"), 0)::text AS "montoComision",
              estado
       FROM comisiones
       WHERE "vendedorId" = $1
       GROUP BY periodo, estado
       ORDER BY periodo DESC
       LIMIT 12`,
      [vendedorId],
    );

    const totales = await this.dataSource.query<{ total: string; pagado: string; pendiente: string }[]>(
      `SELECT
         COALESCE(SUM("montoComision"), 0)::text AS total,
         COALESCE(SUM(CASE WHEN estado = 'pagada' THEN "montoComision" ELSE 0 END), 0)::text AS pagado,
         COALESCE(SUM(CASE WHEN estado != 'pagada' AND estado != 'anulada' THEN "montoComision" ELSE 0 END), 0)::text AS pendiente
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
