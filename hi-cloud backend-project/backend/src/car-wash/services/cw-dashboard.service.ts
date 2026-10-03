import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { fechaHoyRD, inicioDiaRDenUTC, diaSiguienteRD } from '../../common/utils/fecha-local.util';

const ORIGEN_TIPO = 'car_wash_turno';

@Injectable()
export class CwDashboardService {
  constructor(private readonly ds: DataSource) {}

  /**
   * Todo en hora RD: "hoy" se filtra por `cw_turnos."fechaRD"` (columna DATE,
   * ya congelada en hora RD al crear el turno — comparación directa, sin
   * matemática de zona horaria) salvo `ingresosDelDia`, que compara contra
   * `facturas."createdAt"` (TIMESTAMP) con las fronteras UTC calculadas en
   * TypeScript vía inicioDiaRDenUTC/diaSiguienteRD — nunca envolviendo la
   * columna en AT TIME ZONE (ver fecha-local.util.ts).
   */
  async resumen(empresaId: number, sucursalId: number) {
    const hoy = fechaHoyRD();
    const inicioUTC = inicioDiaRDenUTC(hoy);
    const finUTC = inicioDiaRDenUTC(diaSiguienteRD(hoy));

    const [[{ n: vehiculosHoy }], porEstado, [etapas], [{ total: ingresosDelDia }], topServicios, porLavador] = await Promise.all([
      this.ds.query(
        `SELECT COUNT(*)::int AS n FROM cw_turnos WHERE "empresaId" = $1 AND "sucursalId" = $2 AND "fechaRD" = $3`,
        [empresaId, sucursalId, hoy],
      ),
      this.ds.query(
        `SELECT estado, COUNT(*)::int AS n FROM cw_turnos
          WHERE "empresaId" = $1 AND "sucursalId" = $2 AND estado IN ('en_espera', 'en_lavado', 'secado')
          GROUP BY estado`,
        [empresaId, sucursalId],
      ),
      this.ds.query(
        `SELECT
           AVG(EXTRACT(EPOCH FROM ("enLavadoAt" - "enEsperaAt")) / 60) FILTER (WHERE "enLavadoAt" IS NOT NULL) AS espera,
           AVG(EXTRACT(EPOCH FROM (COALESCE("secadoAt", "listoAt") - "enLavadoAt")) / 60)
             FILTER (WHERE "enLavadoAt" IS NOT NULL AND COALESCE("secadoAt", "listoAt") IS NOT NULL) AS lavado,
           AVG(EXTRACT(EPOCH FROM ("listoAt" - "secadoAt")) / 60) FILTER (WHERE "secadoAt" IS NOT NULL AND "listoAt" IS NOT NULL) AS secado,
           AVG(EXTRACT(EPOCH FROM ("entregadoAt" - "listoAt")) / 60) FILTER (WHERE "listoAt" IS NOT NULL AND "entregadoAt" IS NOT NULL) AS espera_entrega
         FROM cw_turnos WHERE "empresaId" = $1 AND "sucursalId" = $2 AND "fechaRD" = $3`,
        [empresaId, sucursalId, hoy],
      ),
      this.ds.query(
        `SELECT COALESCE(SUM(total), 0)::numeric AS total FROM facturas
          WHERE "empresaId" = $1 AND "origenTipo" = $2 AND estado <> 'cancelada'
            AND "createdAt" >= $3::timestamp AND "createdAt" < $4::timestamp`,
        [empresaId, ORIGEN_TIPO, inicioUTC, finUTC],
      ),
      this.ds.query(
        `SELECT ts.nombre, COUNT(*)::int AS cantidad, COALESCE(SUM(ts.precio), 0)::numeric AS ingreso
           FROM cw_turno_servicios ts JOIN cw_turnos t ON t.id = ts."turnoId"
          WHERE t."empresaId" = $1 AND t."sucursalId" = $2 AND t."fechaRD" = $3
          GROUP BY ts.nombre ORDER BY cantidad DESC LIMIT 5`,
        [empresaId, sucursalId, hoy],
      ),
      this.ds.query(
        `SELECT l.nombre, COUNT(DISTINCT tl."turnoId")::int AS vehiculos
           FROM cw_turno_lavadores tl
           JOIN cw_turnos t ON t.id = tl."turnoId"
           JOIN cw_lavadores l ON l.id = tl."lavadorId"
          WHERE t."empresaId" = $1 AND t."sucursalId" = $2 AND t."fechaRD" = $3
          GROUP BY l.nombre ORDER BY vehiculos DESC`,
        [empresaId, sucursalId, hoy],
      ),
    ]);

    const mapaEstado: Record<string, number> = {};
    for (const r of porEstado) mapaEstado[r.estado] = Number(r.n);

    return {
      vehiculosHoy,
      enCola: mapaEstado['en_espera'] ?? 0,
      enLavado: (mapaEstado['en_lavado'] ?? 0) + (mapaEstado['secado'] ?? 0),
      tiempoPromedioPorEtapa: {
        espera: redondear(etapas?.espera),
        lavado: redondear(etapas?.lavado),
        secado: redondear(etapas?.secado),
        esperaEntrega: redondear(etapas?.espera_entrega),
      },
      ingresosDelDia: Number(ingresosDelDia ?? 0),
      topServicios: topServicios.map((s: any) => ({ nombre: s.nombre, cantidad: s.cantidad, ingreso: Number(s.ingreso) })),
      vehiculosPorLavador: porLavador.map((l: any) => ({ nombre: l.nombre, vehiculos: l.vehiculos })),
    };
  }
}

function redondear(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
