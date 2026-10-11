import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Un factor del desglose del score — siempre visible, nunca una caja negra. */
export interface FactorScore {
  factor: string;
  etiqueta: string;
  puntos: number;
  max: number;
  detalle: string;
  sinDato: boolean;
}

export interface ResultadoScore {
  score: number;
  banda: 'A' | 'B' | 'C' | 'D' | 'E';
  bandaEtiqueta: string;
  sinHistorial: boolean;
  factores: FactorScore[];
  clienteDesde: string | null;
  alertaCambioPatron: boolean;
  alertaCambioPatronDetalle: string | null;
}

function banda(score: number): { banda: ResultadoScore['banda']; etiqueta: string } {
  if (score >= 90) return { banda: 'A', etiqueta: 'Excelente' };
  if (score >= 75) return { banda: 'B', etiqueta: 'Bueno' };
  if (score >= 60) return { banda: 'C', etiqueta: 'Aceptable' };
  if (score >= 40) return { banda: 'D', etiqueta: 'Riesgoso' };
  return { banda: 'E', etiqueta: 'Crítico' };
}

/**
 * Motor de reglas determinístico — ver docs/prestamista/etapa-7-scoring.md
 * para el porqué de cada peso y cada corte. Nunca aprueba/rechaza nada: es
 * una señal más para que un humano decida (ficha del deudor, Solicitudes).
 *
 * Se calcula SIEMPRE al vuelo, nunca se persiste ni se cachea (§4 del
 * documento) — mismo patrón que DashboardPrestamistaService/CobranzaService,
 * y la prueba de por qué: pr_deudores.diasMoraHistorico es una columna que
 * se pensó para algo así y nunca se actualizó en ningún lado — queda muerta
 * en 0 para siempre. Este servicio no repite ese error: todo se recalcula
 * en vivo desde pr_prestamos/pr_cuotas/pr_refinanciamientos/pr_garantias/
 * pr_garantes en cada request.
 */
@Injectable()
export class DeudorScoringService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async calcular(empresaId: number, deudorId: number): Promise<ResultadoScore> {
    const [deudor] = await this.ds.query<any[]>(
      `SELECT id, "createdAt" FROM pr_deudores WHERE id=$1 AND "empresaId"=$2`,
      [deudorId, empresaId],
    );
    if (!deudor) throw new NotFoundException(`Deudor #${deudorId} no encontrado`);

    const [resumen] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total,
              COALESCE(MAX("diasMoraActual") FILTER (WHERE estado NOT IN ('cancelado','pagado','refinanciado')), 0) AS "moraMax",
              MIN("fechaDesembolso") AS "primerDesembolso"
       FROM pr_prestamos WHERE "deudorId"=$1 AND "empresaId"=$2`,
      [deudorId, empresaId],
    );
    const totalPrestamos = Number(resumen.total ?? 0);
    const clienteDesde = resumen.primerDesembolso ?? deudor.createdAt ?? null;

    // Caso especial §2.0 — sin ningún préstamo todavía: no se fabrica una
    // suma parcial con datos que no existen, se devuelve un neutral fijo.
    if (totalPrestamos === 0) {
      const factores: FactorScore[] = [
        { factor: 'puntualidad', etiqueta: 'Puntualidad de pago', puntos: 0, max: 30, detalle: 'Sin préstamos todavía — no hay cuotas que evaluar.', sinDato: true },
        { factor: 'moraActual', etiqueta: 'Mora vigente', puntos: 0, max: 20, detalle: 'Sin préstamos todavía.', sinDato: true },
        { factor: 'historial', etiqueta: 'Refinanciamientos y condonaciones previas', puntos: 0, max: 25, detalle: 'Sin préstamos todavía.', sinDato: true },
        { factor: 'trayectoria', etiqueta: 'Trayectoria de préstamos cerrados', puntos: 0, max: 15, detalle: 'Sin préstamos todavía.', sinDato: true },
        { factor: 'respaldo', etiqueta: 'Garantías y garantes activos', puntos: 0, max: 10, detalle: 'Sin préstamos todavía.', sinDato: true },
      ];
      return {
        score: 60,
        banda: 'C',
        bandaEtiqueta: 'Aceptable',
        sinHistorial: true,
        factores,
        clienteDesde,
        alertaCambioPatron: false,
        alertaCambioPatronDetalle: null,
      };
    }

    const [puntualidad] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE c."fechaPago" <= c."fechaVencimiento")::int AS "aTiempo"
       FROM pr_cuotas c JOIN pr_prestamos p ON p.id=c."prestamoId" AND p."empresaId"=c."empresaId"
       WHERE p."deudorId"=$1 AND p."empresaId"=$2 AND c.estado='pagada'`,
      [deudorId, empresaId],
    );
    const cuotasPagadas = Number(puntualidad.total ?? 0);
    const cuotasATiempo = Number(puntualidad.aTiempo ?? 0);

    const [cerradosLimpios] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS cerrados,
              COUNT(*) FILTER (WHERE p.estado='pagado' AND COALESCE(cond.total, 0) = 0)::int AS limpios
       FROM pr_prestamos p
       LEFT JOIN (
         SELECT "prestamoId", SUM("moraCondonada" + "interesCondonado") AS total
         FROM pr_cuotas WHERE "empresaId"=$2 GROUP BY "prestamoId"
       ) cond ON cond."prestamoId" = p.id
       WHERE p."deudorId"=$1 AND p."empresaId"=$2 AND p.estado IN ('pagado','cancelado','refinanciado')`,
      [deudorId, empresaId],
    );

    const [refinanciamientos] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM("moraCondonada" + "interesCondonado"), 0) AS "montoCondonado"
       FROM pr_refinanciamientos WHERE "deudorId"=$1 AND "empresaId"=$2`,
      [deudorId, empresaId],
    );

    const [condonacionDirecta] = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM(c."moraCondonada" + c."interesCondonado"), 0) AS "montoCondonado"
       FROM pr_cuotas c JOIN pr_prestamos p ON p.id=c."prestamoId" AND p."empresaId"=c."empresaId"
       WHERE p."deudorId"=$1 AND p."empresaId"=$2`,
      [deudorId, empresaId],
    );

    const [respaldo] = await this.ds.query<any[]>(
      `SELECT
         EXISTS(SELECT 1 FROM pr_garantias WHERE "deudorId"=$1 AND "empresaId"=$2 AND estado='activa') AS "tieneGarantia",
         EXISTS(
           SELECT 1 FROM pr_garantes g JOIN pr_prestamos p ON p.id=g."prestamoId" AND p."empresaId"=g."empresaId"
           WHERE p."deudorId"=$1 AND p."empresaId"=$2 AND g.estado='activo'
         ) AS "tieneGarante"`,
      [deudorId, empresaId],
    );

    // Factor 1 — puntualidad (0-30).
    let puntosPuntualidad: number;
    let detallePuntualidad: string;
    let sinDatoPuntualidad = false;
    if (cuotasPagadas === 0) {
      puntosPuntualidad = 15;
      detallePuntualidad = 'Sin cuotas pagadas todavía — se asigna la mitad de los puntos (ni premio ni castigo) hasta que haya pagos que evaluar.';
      sinDatoPuntualidad = true;
    } else {
      const pct = (cuotasATiempo / cuotasPagadas) * 100;
      puntosPuntualidad = Math.round(30 * (cuotasATiempo / cuotasPagadas));
      detallePuntualidad = `${cuotasATiempo} de ${cuotasPagadas} cuotas pagadas a tiempo (${pct.toFixed(0)}%).`;
    }

    // Factor 2 — mora vigente (0-20). Mismos cortes que Dashboard/Cobranza.
    const moraMax = Number(resumen.moraMax ?? 0);
    let puntosMora: number;
    if (moraMax === 0) puntosMora = 20;
    else if (moraMax <= 30) puntosMora = 14;
    else if (moraMax <= 60) puntosMora = 8;
    else if (moraMax <= 90) puntosMora = 3;
    else puntosMora = 0;
    const detalleMora = moraMax === 0
      ? 'Sin mora vigente en ningún préstamo activo.'
      : `${moraMax} día(s) de mora en el préstamo activo más atrasado.`;

    // Factor 3 — refinanciamientos y condonaciones previas (0-25).
    const totalRefi = Number(refinanciamientos.total ?? 0);
    const montoCondonado = Number(refinanciamientos.montoCondonado ?? 0) + Number(condonacionDirecta.montoCondonado ?? 0);
    let puntosHistorial = 25;
    const motivosHistorial: string[] = [];
    if (totalRefi >= 1) { puntosHistorial -= 15; motivosHistorial.push(`${totalRefi} refinanciamiento(s) previo(s)`); }
    if (montoCondonado > 0) { puntosHistorial -= 15; motivosHistorial.push(`RD$ ${montoCondonado.toFixed(2)} condonados (mora/interés) en su historial`); }
    puntosHistorial = Math.max(0, puntosHistorial);
    const detalleHistorial = motivosHistorial.length
      ? motivosHistorial.join(' y ') + '.'
      : 'Sin refinanciamientos ni condonaciones en su historial.';

    // Factor 4 — trayectoria de préstamos cerrados (0-15).
    const cerrados = Number(cerradosLimpios.cerrados ?? 0);
    const limpios = Number(cerradosLimpios.limpios ?? 0);
    let puntosTrayectoria: number;
    let detalleTrayectoria: string;
    let sinDatoTrayectoria = false;
    if (cerrados === 0) {
      puntosTrayectoria = 8;
      detalleTrayectoria = 'Todavía no cerró ningún préstamo — se asigna la mitad de los puntos hasta que termine uno.';
      sinDatoTrayectoria = true;
    } else {
      puntosTrayectoria = Math.round(15 * (limpios / cerrados));
      detalleTrayectoria = `${limpios} de ${cerrados} préstamo(s) cerrados sin refinanciar ni condonar.`;
    }

    // Factor 5 — respaldo: garantías y garantes activos (0-10). Nunca "sinDato": la ausencia es un hecho real desde el primer día.
    const tieneGarantia = Boolean(respaldo.tieneGarantia);
    const tieneGarante = Boolean(respaldo.tieneGarante);
    const puntosRespaldo = (tieneGarantia ? 5 : 0) + (tieneGarante ? 5 : 0);
    const detalleRespaldo = [
      tieneGarantia ? 'tiene garantía activa' : 'sin garantía activa',
      tieneGarante ? 'tiene garante activo' : 'sin garante activo',
    ].join(', ') + '.';

    const factores: FactorScore[] = [
      { factor: 'puntualidad', etiqueta: 'Puntualidad de pago', puntos: puntosPuntualidad, max: 30, detalle: detallePuntualidad, sinDato: sinDatoPuntualidad },
      { factor: 'moraActual', etiqueta: 'Mora vigente', puntos: puntosMora, max: 20, detalle: detalleMora, sinDato: false },
      { factor: 'historial', etiqueta: 'Refinanciamientos y condonaciones previas', puntos: puntosHistorial, max: 25, detalle: detalleHistorial, sinDato: false },
      { factor: 'trayectoria', etiqueta: 'Trayectoria de préstamos cerrados', puntos: puntosTrayectoria, max: 15, detalle: detalleTrayectoria, sinDato: sinDatoTrayectoria },
      { factor: 'respaldo', etiqueta: 'Garantías y garantes activos', puntos: puntosRespaldo, max: 10, detalle: detalleRespaldo, sinDato: false },
    ];

    const score = factores.reduce((a, f) => a + f.puntos, 0);
    const { banda: letra, etiqueta } = banda(score);

    // "Inteligencia" §3 — alerta de cambio de patrón: buen historial de
    // puntualidad pero en mora ahora mismo. Reutiliza números ya calculados
    // arriba, cero queries adicionales.
    const pctPuntualidadHistorica = cuotasPagadas > 0 ? (cuotasATiempo / cuotasPagadas) * 100 : 0;
    const alertaCambioPatron = cuotasPagadas >= 3 && pctPuntualidadHistorica >= 80 && moraMax >= 5;
    const alertaCambioPatronDetalle = alertaCambioPatron
      ? `Tiene buen historial de pago (${pctPuntualidadHistorica.toFixed(0)}% a tiempo) pero está en mora ahora mismo (${moraMax} día(s)) — puede ser un cambio de situación reciente, no un mal pagador crónico.`
      : null;

    return {
      score,
      banda: letra,
      bandaEtiqueta: etiqueta,
      sinHistorial: false,
      factores,
      clienteDesde,
      alertaCambioPatron,
      alertaCambioPatronDetalle,
    };
  }
}
