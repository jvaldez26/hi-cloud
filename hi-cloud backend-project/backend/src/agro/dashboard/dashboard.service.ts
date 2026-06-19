import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AgroDashboardService {
  private readonly logger = new Logger(AgroDashboardService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getDashboard(empresaId: number) {
    const [kpiCiclos] = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER(WHERE estado NOT IN ('cerrado','cancelado')) AS activos,
         COUNT(*) FILTER(WHERE estado='cosechado') AS cosechados,
         COUNT(*) FILTER(WHERE estado='cerrado') AS cerrados,
         COALESCE(SUM("areaSembrada") FILTER(WHERE estado NOT IN ('cerrado','cancelado')),0) AS "areaSembrada",
         COALESCE(SUM("costoTotal"),0) AS "costoTotalActivos"
       FROM ag_ciclos WHERE "empresaId"=$1`,
      [empresaId],
    );

    const [kpiAnimales] = await this.ds.query<any[]>(
      `SELECT COUNT(*) AS total,
         COUNT(*) FILTER(WHERE tipo='bovino') AS bovinos,
         COUNT(*) FILTER(WHERE tipo='porcino') AS porcinos,
         COUNT(*) FILTER(WHERE proposito='leche') AS leche
       FROM ag_animales WHERE "empresaId"=$1 AND estado='activo' AND "isActive"=true`,
      [empresaId],
    );

    const [kpiInsumos] = await this.ds.query<any[]>(
      `SELECT COUNT(*) FILTER(WHERE "stockActual" <= "stockMinimo") AS stockBajo
       FROM ag_insumos WHERE "empresaId"=$1 AND "isActive"=true`,
      [empresaId],
    );

    const ciclosActivos = await this.ds.query<any[]>(
      `SELECT c.*, p.nombre AS "parcelaNombre", cu.nombre AS "cultivoNombre",
              cu.variedad AS "cultivoVariedad",
              CURRENT_DATE - c."fechaSiembra"::date AS "diasTranscurridos",
              c."fechaEstimadaCosecha"::date - CURRENT_DATE AS "diasParaCosecha"
         FROM ag_ciclos c
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
        WHERE c."empresaId"=$1 AND c.estado NOT IN ('cerrado','cancelado')
        ORDER BY c."fechaEstimadaCosecha"
        LIMIT 10`,
      [empresaId],
    );

    const proximasCosechas = await this.ds.query<any[]>(
      `SELECT c.numero, cu.nombre AS cultivo, p.nombre AS parcela,
              c."fechaEstimadaCosecha",
              c."fechaEstimadaCosecha"::date - CURRENT_DATE AS dias,
              c."rendimientoEstimado", c."unidadCosecha"
         FROM ag_ciclos c
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
        WHERE c."empresaId"=$1 AND c.estado NOT IN ('cerrado','cancelado')
          AND c."fechaEstimadaCosecha" IS NOT NULL
          AND c."fechaEstimadaCosecha"::date >= CURRENT_DATE
        ORDER BY c."fechaEstimadaCosecha"
        LIMIT 5`,
      [empresaId],
    );

    const calendarioSanitario = await this.ds.query<any[]>(
      `SELECT e."proximaFecha", e.tipo, e.producto, a.numero AS arete, a.nombre,
              e."proximaFecha"::date - CURRENT_DATE AS diasRestantes
         FROM ag_eventos_animal e
         JOIN ag_animales a ON a.id=e."animalId"
        WHERE e."empresaId"=$1 AND e."proximaFecha" IS NOT NULL
          AND e."proximaFecha"::date BETWEEN CURRENT_DATE AND CURRENT_DATE+30
          AND a.estado='activo'
        ORDER BY e."proximaFecha"
        LIMIT 10`,
      [empresaId],
    );

    const insumosStockBajo = await this.ds.query<any[]>(
      `SELECT nombre, tipo, "stockActual", "stockMinimo", unidad
         FROM ag_insumos WHERE "empresaId"=$1 AND "isActive"=true
          AND "stockActual" <= "stockMinimo" ORDER BY nombre LIMIT 10`,
      [empresaId],
    );

    const produccionLeche = await this.ds.query<any[]>(
      `SELECT DATE(e.fecha) AS dia, SUM(e."cantidadProduccion") AS total, e."unidadProduccion"
         FROM ag_eventos_animal e
         JOIN ag_animales a ON a.id=e."animalId"
        WHERE e."empresaId"=$1 AND e.tipo='produccion_leche'
          AND e.fecha >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(e.fecha), e."unidadProduccion"
        ORDER BY dia DESC`,
      [empresaId],
    );

    const rentabilidadCiclos = await this.ds.query<any[]>(
      `SELECT numero, "cultivoId",
              COALESCE((SELECT cu.nombre FROM ag_cultivos cu WHERE cu.id=c."cultivoId"),'') AS cultivo,
              "costoTotal", "ingresoVentas",
              "ingresoVentas" - "costoTotal" AS rentabilidad,
              CASE WHEN "ingresoVentas">0
                   THEN ROUND((("ingresoVentas"-"costoTotal")/"ingresoVentas")*100,1)
                   ELSE 0 END AS "margenPct"
         FROM ag_ciclos c
        WHERE "empresaId"=$1 AND estado='cerrado'
        ORDER BY "createdAt" DESC LIMIT 5`,
      [empresaId],
    );

    return {
      kpi: {
        ciclosActivos:     Number(kpiCiclos.activos),
        areaSembrada:      Number(kpiCiclos.areaSembrada),
        animalesTotal:     Number(kpiAnimales.total),
        costoTotalActivos: Number(kpiCiclos.costoTotalActivos),
        insumosStockBajo:  Number(kpiInsumos.stockBajo),
      },
      ciclosActivos,
      proximasCosechas,
      calendarioSanitario,
      insumosStockBajo,
      produccionLeche,
      rentabilidadCiclos,
    };
  }
}
