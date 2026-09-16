import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ColegiaturaService } from '../colegiatura/colegiatura.service';

/**
 * Los 14 reportes del plan original de educativo — todos SQL crudo vía
 * DataSource.query() contra tablas reales, nunca identificadores escritos a
 * mano sin verificar (ver incidente 2026-09-06, 26 bugs de este módulo por
 * exactamente eso). empresaId siempre primero en el WHERE.
 *
 * Cartera y morosidad (reportes 1-2) reusan literalmente
 * ColegiaturaService.resumenFinanciero() y su misma definición de "vencido"
 * — la pantalla de Colegiatura llama a ese mismo método
 * (GET educativo/colegiatura/resumen); si este reporte calculara "vencido"
 * con un criterio propio, el número no cuadraría con lo que el colegio ya
 * ve en pantalla y nadie confiaría en ninguno de los dos.
 *
 * Enfermería NO tiene reporte aquí — ninguno de los 14 lo pide.
 */
@Injectable()
export class EdReportesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly colegiaturaSvc: ColegiaturaService,
  ) {}

  // ── Helpers compartidos ──────────────────────────────────────────────────

  private async anioEscolarEfectivo(empresaId: number, anioEscolarId?: number) {
    if (anioEscolarId) return anioEscolarId;
    const [activo] = await this.ds.query<any[]>(
      `SELECT id FROM ed_anios_escolares WHERE "empresaId" = $1 AND "esActual" = true LIMIT 1`,
      [empresaId],
    );
    return activo?.id ?? null;
  }

  private async notaMinimaAprobar(empresaId: number): Promise<number> {
    const [cfg] = await this.ds.query<any[]>(
      `SELECT "notaMinimaAprobar" FROM ed_config WHERE "empresaId" = $1`,
      [empresaId],
    );
    return Number(cfg?.notaMinimaAprobar ?? 70);
  }

  /** Mismo mecanismo de acceso por rol que disciplina.service.ts — ver ese archivo. */
  private async resolverDocenteId(empresaId: number, usuarioId: number): Promise<number | null> {
    const [row] = await this.ds.query<any[]>(
      `SELECT id FROM ed_docentes WHERE "empresaId" = $1 AND "usuarioId" = $2 AND "isActive" = true LIMIT 1`,
      [empresaId, usuarioId],
    );
    return row?.id ?? null;
  }

  private async seccionesDelDocente(empresaId: number, docenteId: number): Promise<number[]> {
    const rows = await this.ds.query<any[]>(
      `SELECT DISTINCT "seccionId" FROM ed_asignaciones_docente
       WHERE "empresaId" = $1 AND "docenteId" = $2 AND "isActive" = true`,
      [empresaId, docenteId],
    );
    return rows.map(r => r.seccionId);
  }

  // ── 1. Cartera de colegiatura (al día vs vencida) ────────────────────────

  async carteraColegiatura(empresaId: number, opts: { anioEscolarId?: number } = {}) {
    const resumen = await this.colegiaturaSvc.resumenFinanciero(empresaId, opts.anioEscolarId);

    const joinCond = opts.anioEscolarId
      ? `JOIN ed_planes_pago pp ON pp.id = c."planPagoId" AND pp."anioEscolarId" = $2`
      : '';
    const params = opts.anioEscolarId ? [empresaId, opts.anioEscolarId] : [empresaId];

    const porEstudiante = await this.ds.query<any[]>(
      `SELECT e.id AS "estudianteId", e.nombres || ' ' || e.apellidos AS estudiante, e.cedula,
              COALESCE(SUM(c."saldoPendiente") FILTER (WHERE c.estado IN ('pendiente','parcial')), 0)::numeric AS pendiente,
              COALESCE(SUM(c."saldoPendiente") FILTER (
                WHERE c.estado IN ('vencido','parcial') OR (c.estado = 'pendiente' AND c."fechaVencimiento" < CURRENT_DATE)
              ), 0)::numeric AS vencido
       FROM ed_cargos c
       JOIN ed_estudiantes e ON e.id = c."estudianteId"
       ${joinCond}
       WHERE c."empresaId" = $1
       GROUP BY e.id, e.nombres, e.apellidos, e.cedula
       HAVING COALESCE(SUM(c."saldoPendiente") FILTER (WHERE c.estado IN ('pendiente','parcial')), 0) > 0
       ORDER BY vencido DESC, pendiente DESC`,
      params,
    );

    return { resumen, porEstudiante };
  }

  // ── 2. Índice de morosidad por grado ──────────────────────────────────────

  async morosidadPorGrado(empresaId: number, opts: { anioEscolarId?: number } = {}) {
    const anioEscolarId = await this.anioEscolarEfectivo(empresaId, opts.anioEscolarId);

    const filas = await this.ds.query<any[]>(
      `WITH vencidos AS (
         SELECT c."estudianteId",
                SUM(c."saldoPendiente") FILTER (
                  WHERE c.estado IN ('vencido','parcial') OR (c.estado = 'pendiente' AND c."fechaVencimiento" < CURRENT_DATE)
                ) AS vencido
         FROM ed_cargos c
         WHERE c."empresaId" = $1
         GROUP BY c."estudianteId"
       )
       SELECT g.id AS "gradoId", g.nombre AS grado,
              COUNT(DISTINCT m."estudianteId")::int AS "totalEstudiantes",
              COUNT(DISTINCT m."estudianteId") FILTER (WHERE COALESCE(v.vencido, 0) > 0)::int AS "estudiantesMorosos",
              COALESCE(SUM(v.vencido) FILTER (WHERE v.vencido > 0), 0)::numeric AS "montoVencido"
       FROM ed_matriculas m
       JOIN ed_grados g ON g.id = m."gradoId"
       LEFT JOIN vencidos v ON v."estudianteId" = m."estudianteId"
       WHERE m."empresaId" = $1 AND m.estado = 'activa' AND m."anioEscolarId" = $2
       GROUP BY g.id, g.nombre, g.orden
       ORDER BY g.orden`,
      [empresaId, anioEscolarId],
    );

    return filas.map(f => ({
      ...f,
      indiceMorosidad: f.totalEstudiantes > 0
        ? Math.round((f.estudiantesMorosos / f.totalEstudiantes) * 1000) / 10
        : 0,
    }));
  }

  // ── 3. Cobros del período (proyectado vs real) ────────────────────────────

  async cobrosPeriodo(empresaId: number, opts: { desde?: string; hasta?: string } = {}) {
    const hoy = new Date();
    const desde = opts.desde ?? `${hoy.getFullYear()}-01-01`;
    const hasta = opts.hasta ?? `${hoy.getFullYear()}-12-31`;

    const proyectado = await this.ds.query<any[]>(
      `SELECT to_char(date_trunc('month', c."fechaVencimiento"), 'YYYY-MM') AS mes,
              COALESCE(SUM(c."montoTotal"), 0)::numeric AS proyectado
       FROM ed_cargos c
       WHERE c."empresaId" = $1 AND c."fechaVencimiento" BETWEEN $2 AND $3 AND c.estado != 'anulado'
       GROUP BY 1 ORDER BY 1`,
      [empresaId, desde, hasta],
    );
    const real = await this.ds.query<any[]>(
      `SELECT to_char(date_trunc('month', p.fecha), 'YYYY-MM') AS mes,
              COALESCE(SUM(p.monto), 0)::numeric AS real
       FROM ed_pagos p
       WHERE p."empresaId" = $1 AND p.fecha BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 1`,
      [empresaId, desde, hasta],
    );

    const meses = new Map<string, { mes: string; proyectado: number; real: number }>();
    for (const p of proyectado) meses.set(p.mes, { mes: p.mes, proyectado: Number(p.proyectado), real: 0 });
    for (const r of real) {
      const fila = meses.get(r.mes) ?? { mes: r.mes, proyectado: 0, real: 0 };
      fila.real = Number(r.real);
      meses.set(r.mes, fila);
    }
    return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  // ── 4. Rendimiento académico por grado y sección ──────────────────────────

  async rendimientoAcademico(empresaId: number, opts: { periodoId?: number; gradoId?: number; seccionId?: number } = {}) {
    const conds = [`np."empresaId" = $1`, `np."notaFinal" IS NOT NULL`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.periodoId) { conds.push(`np."periodoId" = $${idx}`); params.push(opts.periodoId); idx++; }
    if (opts.gradoId)   { conds.push(`g.id = $${idx}`);           params.push(opts.gradoId);   idx++; }
    if (opts.seccionId) { conds.push(`s.id = $${idx}`);           params.push(opts.seccionId); idx++; }

    return this.ds.query<any[]>(
      `SELECT g.id AS "gradoId", g.nombre AS grado, s.id AS "seccionId", s.nombre AS seccion,
              COUNT(DISTINCT np."estudianteId")::int AS estudiantes,
              ROUND(AVG(np."notaFinal")::numeric, 2) AS promedio,
              ROUND((COUNT(*) FILTER (WHERE np.aprobado = true)::numeric / NULLIF(COUNT(*), 0)) * 100, 1) AS "pctAprobacion"
       FROM ed_notas_periodo np
       JOIN ed_secciones s ON s.id = np."seccionId"
       JOIN ed_grados g ON g.id = s."gradoId"
       WHERE ${conds.join(' AND ')}
       GROUP BY g.id, g.nombre, g.orden, s.id, s.nombre
       ORDER BY g.orden, s.nombre`,
      params,
    );
  }

  // ── 5. Estudiantes en riesgo (bajo promedio) ──────────────────────────────

  async estudiantesRiesgo(empresaId: number, opts: { periodoId?: number; gradoId?: number; seccionId?: number; umbral?: number } = {}) {
    const umbral = opts.umbral ?? await this.notaMinimaAprobar(empresaId);
    const conds = [`np."empresaId" = $1`, `np."notaFinal" IS NOT NULL`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.periodoId) { conds.push(`np."periodoId" = $${idx}`); params.push(opts.periodoId); idx++; }
    if (opts.gradoId)   { conds.push(`g.id = $${idx}`);           params.push(opts.gradoId);   idx++; }
    if (opts.seccionId) { conds.push(`s.id = $${idx}`);           params.push(opts.seccionId); idx++; }
    const umbralIdx = idx;
    params.push(umbral);

    return this.ds.query<any[]>(
      `SELECT e.id AS "estudianteId", e.nombres || ' ' || e.apellidos AS estudiante,
              g.nombre AS grado, s.nombre AS seccion,
              ROUND(AVG(np."notaFinal")::numeric, 2) AS promedio,
              COUNT(*) FILTER (WHERE np.aprobado = false)::int AS "asignaturasReprobadas"
       FROM ed_notas_periodo np
       JOIN ed_estudiantes e ON e.id = np."estudianteId"
       JOIN ed_secciones s ON s.id = np."seccionId"
       JOIN ed_grados g ON g.id = s."gradoId"
       WHERE ${conds.join(' AND ')}
       GROUP BY e.id, e.nombres, e.apellidos, g.nombre, g.orden, s.nombre
       HAVING AVG(np."notaFinal") < $${umbralIdx}
       ORDER BY promedio ASC`,
      params,
    );
  }

  // ── 6. Cuadro de honor por período ────────────────────────────────────────

  async cuadroHonor(empresaId: number, opts: { periodoId?: number; gradoId?: number; seccionId?: number; limite?: number } = {}) {
    const conds = [`np."empresaId" = $1`, `np."notaFinal" IS NOT NULL`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.periodoId) { conds.push(`np."periodoId" = $${idx}`); params.push(opts.periodoId); idx++; }
    if (opts.gradoId)   { conds.push(`g.id = $${idx}`);           params.push(opts.gradoId);   idx++; }
    if (opts.seccionId) { conds.push(`s.id = $${idx}`);           params.push(opts.seccionId); idx++; }
    const limite = opts.limite ?? 10;
    params.push(limite);

    return this.ds.query<any[]>(
      `SELECT e.id AS "estudianteId", e.nombres || ' ' || e.apellidos AS estudiante,
              g.nombre AS grado, s.nombre AS seccion,
              ROUND(AVG(np."notaFinal")::numeric, 2) AS promedio
       FROM ed_notas_periodo np
       JOIN ed_estudiantes e ON e.id = np."estudianteId"
       JOIN ed_secciones s ON s.id = np."seccionId"
       JOIN ed_grados g ON g.id = s."gradoId"
       WHERE ${conds.join(' AND ')}
       GROUP BY e.id, e.nombres, e.apellidos, g.nombre, s.nombre
       ORDER BY promedio DESC
       LIMIT $${idx}`,
      params,
    );
  }

  // ── 7. Asistencia por grado y período ─────────────────────────────────────

  async asistenciaGradoPeriodo(empresaId: number, opts: { gradoId?: number; seccionId?: number; desde?: string; hasta?: string } = {}) {
    const conds = [`a."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.desde)     { conds.push(`a.fecha >= $${idx}`); params.push(opts.desde);     idx++; }
    if (opts.hasta)     { conds.push(`a.fecha <= $${idx}`); params.push(opts.hasta);     idx++; }
    if (opts.gradoId)   { conds.push(`g.id = $${idx}`);     params.push(opts.gradoId);   idx++; }
    if (opts.seccionId) { conds.push(`s.id = $${idx}`);     params.push(opts.seccionId); idx++; }

    return this.ds.query<any[]>(
      `SELECT g.id AS "gradoId", g.nombre AS grado, s.id AS "seccionId", s.nombre AS seccion,
              COUNT(*) FILTER (WHERE a.estado = 'presente')::int    AS presentes,
              COUNT(*) FILTER (WHERE a.estado = 'ausente')::int     AS ausentes,
              COUNT(*) FILTER (WHERE a.estado = 'tardanza')::int    AS tardanzas,
              COUNT(*) FILTER (WHERE a.estado = 'justificado')::int AS justificados,
              COUNT(*)::int AS total,
              ROUND((COUNT(*) FILTER (WHERE a.estado = 'presente')::numeric / NULLIF(COUNT(*), 0)) * 100, 1) AS "pctAsistencia"
       FROM ed_asistencia a
       JOIN ed_secciones s ON s.id = a."seccionId"
       JOIN ed_grados g ON g.id = s."gradoId"
       WHERE ${conds.join(' AND ')}
       GROUP BY g.id, g.nombre, g.orden, s.id, s.nombre
       ORDER BY g.orden, s.nombre`,
      params,
    );
  }

  // ── 8. Estudiantes con exceso de ausencias ────────────────────────────────

  async excesoAusencias(empresaId: number, opts: { gradoId?: number; seccionId?: number; desde?: string; hasta?: string; umbral?: number } = {}) {
    const umbral = opts.umbral ?? 5;
    const conds = [`a."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.desde)     { conds.push(`a.fecha >= $${idx}`); params.push(opts.desde);     idx++; }
    if (opts.hasta)     { conds.push(`a.fecha <= $${idx}`); params.push(opts.hasta);     idx++; }
    if (opts.gradoId)   { conds.push(`g.id = $${idx}`);     params.push(opts.gradoId);   idx++; }
    if (opts.seccionId) { conds.push(`s.id = $${idx}`);     params.push(opts.seccionId); idx++; }
    const umbralIdx = idx;
    params.push(umbral);

    return this.ds.query<any[]>(
      `SELECT e.id AS "estudianteId", e.nombres || ' ' || e.apellidos AS estudiante,
              g.nombre AS grado, s.nombre AS seccion,
              COUNT(*) FILTER (WHERE a.estado = 'ausente')::int AS ausencias
       FROM ed_asistencia a
       JOIN ed_estudiantes e ON e.id = a."estudianteId"
       JOIN ed_secciones s ON s.id = a."seccionId"
       JOIN ed_grados g ON g.id = s."gradoId"
       WHERE ${conds.join(' AND ')}
       GROUP BY e.id, e.nombres, e.apellidos, g.nombre, s.nombre
       HAVING COUNT(*) FILTER (WHERE a.estado = 'ausente') >= $${umbralIdx}
       ORDER BY ausencias DESC`,
      params,
    );
  }

  // ── 9. Matrícula por grado y año (crecimiento) ────────────────────────────

  async matriculaCrecimiento(empresaId: number, opts: { gradoId?: number } = {}) {
    const params: any[] = [empresaId];
    let gradoCond = '';
    if (opts.gradoId) { gradoCond = `AND m."gradoId" = $2`; params.push(opts.gradoId); }

    const porAnio = await this.ds.query<any[]>(
      `SELECT a.id AS "anioEscolarId", a.nombre AS anio, a."fechaInicio",
              COUNT(m.id)::int AS total
       FROM ed_anios_escolares a
       LEFT JOIN ed_matriculas m
         ON m."anioEscolarId" = a.id AND m."empresaId" = a."empresaId" AND m.estado = 'activa' ${gradoCond}
       WHERE a."empresaId" = $1
       GROUP BY a.id, a.nombre, a."fechaInicio"
       ORDER BY a."fechaInicio"`,
      params,
    );

    return porAnio.map((fila, i) => {
      const anterior = i > 0 ? porAnio[i - 1].total : null;
      const crecimientoPct = anterior && Number(anterior) > 0
        ? Math.round(((fila.total - anterior) / anterior) * 1000) / 10
        : null;
      return { ...fila, crecimientoPct };
    });
  }

  // ── 10. Incidentes disciplinarios por tipo ────────────────────────────────
  // Mismo control de acceso por rol que /educativo/disciplina — un docente
  // solo ve el conteo de sus propias secciones, nunca el total del colegio.

  async incidentesDisciplinariosPorTipo(empresaId: number, usuarioId: number, opts: { desde?: string; hasta?: string } = {}) {
    const conds = [`d."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;

    const docenteId = await this.resolverDocenteId(empresaId, usuarioId);
    if (docenteId) {
      const secciones = await this.seccionesDelDocente(empresaId, docenteId);
      if (!secciones.length) return [];
      conds.push(`d."seccionId" = ANY($${idx})`); params.push(secciones); idx++;
    }

    if (opts.desde) { conds.push(`d.fecha >= $${idx}`); params.push(opts.desde); idx++; }
    if (opts.hasta) { conds.push(`d.fecha <= $${idx}`); params.push(opts.hasta); idx++; }

    return this.ds.query<any[]>(
      `SELECT tipo, COUNT(*)::int AS cantidad
       FROM ed_disciplina d
       WHERE ${conds.join(' AND ')}
       GROUP BY tipo
       ORDER BY cantidad DESC`,
      params,
    );
  }

  // ── 11. Ingresos por concepto (colegiatura, transporte, comedor) ─────────

  async ingresosPorConcepto(empresaId: number, opts: { desde?: string; hasta?: string } = {}) {
    const conds = [`p."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.desde) { conds.push(`p.fecha >= $${idx}`); params.push(opts.desde); idx++; }
    if (opts.hasta) { conds.push(`p.fecha <= $${idx}`); params.push(opts.hasta); idx++; }

    return this.ds.query<any[]>(
      `SELECT COALESCE(c.tipo, 'otro') AS concepto,
              COALESCE(SUM(p.monto), 0)::numeric AS total,
              COUNT(*)::int AS cantidad
       FROM ed_pagos p
       LEFT JOIN ed_cargos c ON c.id = p."cargoId"
       WHERE ${conds.join(' AND ')}
       GROUP BY COALESCE(c.tipo, 'otro')
       ORDER BY total DESC`,
      params,
    );
  }

  // ── 12. Retención de estudiantes (reinscripciones) ────────────────────────

  async retencionEstudiantes(empresaId: number, opts: { anioBaseId?: number; anioSiguienteId?: number } = {}) {
    const anioSiguienteId = opts.anioSiguienteId ?? await this.anioEscolarEfectivo(empresaId);
    let anioBaseId = opts.anioBaseId;
    if (!anioBaseId) {
      const [siguiente] = await this.ds.query<any[]>(
        `SELECT "fechaInicio" FROM ed_anios_escolares WHERE id = $1 AND "empresaId" = $2`,
        [anioSiguienteId, empresaId],
      );
      const [base] = await this.ds.query<any[]>(
        `SELECT id FROM ed_anios_escolares
         WHERE "empresaId" = $1 AND "fechaInicio" < $2
         ORDER BY "fechaInicio" DESC LIMIT 1`,
        [empresaId, siguiente?.fechaInicio ?? new Date().toISOString().slice(0, 10)],
      );
      anioBaseId = base?.id ?? null;
    }
    if (!anioBaseId || !anioSiguienteId) {
      return { anioBaseId, anioSiguienteId, totalAnioBase: 0, retenidos: 0, pctRetencion: null, noRetenidos: [] };
    }

    const [{ total_base }] = await this.ds.query<any[]>(
      `SELECT COUNT(DISTINCT "estudianteId")::int AS total_base
       FROM ed_matriculas WHERE "empresaId" = $1 AND "anioEscolarId" = $2 AND estado = 'activa'`,
      [empresaId, anioBaseId],
    );
    const noRetenidos = await this.ds.query<any[]>(
      `SELECT DISTINCT e.id AS "estudianteId", e.nombres || ' ' || e.apellidos AS estudiante
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."empresaId" = $1 AND m."anioEscolarId" = $2 AND m.estado = 'activa'
         AND NOT EXISTS (
           SELECT 1 FROM ed_matriculas m2
           WHERE m2."empresaId" = $1 AND m2."anioEscolarId" = $3 AND m2."estudianteId" = m."estudianteId"
         )
       ORDER BY estudiante`,
      [empresaId, anioBaseId, anioSiguienteId],
    );

    const totalAnioBase = Number(total_base);
    const retenidos = totalAnioBase - noRetenidos.length;
    return {
      anioBaseId, anioSiguienteId, totalAnioBase, retenidos,
      pctRetencion: totalAnioBase > 0 ? Math.round((retenidos / totalAnioBase) * 1000) / 10 : null,
      noRetenidos,
    };
  }

  // ── 13. Becas otorgadas y monto total ─────────────────────────────────────

  async becasOtorgadas(empresaId: number, opts: { anioEscolarId?: number } = {}) {
    const conds = [`eb."empresaId" = $1`, `eb."isActive" = true`];
    const params: any[] = [empresaId];
    if (opts.anioEscolarId) { conds.push(`(eb."anioEscolarId" IS NULL OR eb."anioEscolarId" = $2)`); params.push(opts.anioEscolarId); }

    const listado = await this.ds.query<any[]>(
      `SELECT eb.id, e.nombres || ' ' || e.apellidos AS estudiante,
              b.nombre AS beca, b.tipo, b.valor, eb."fechaAsignacion", eb.motivo
       FROM ed_estudiante_becas eb
       JOIN ed_becas b ON b.id = eb."becaId"
       JOIN ed_estudiantes e ON e.id = eb."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY eb."fechaAsignacion" DESC`,
      params,
    );

    // Monto real otorgado: se lee de ed_cargos.concepto ("beca:<id>:<monto>",
    // formato que colegiatura.service.ts escribe al generar cargos — nunca
    // se recalcula aparte, es el mismo descuento que ya se aplicó a cada
    // cargo real, ver ColegiaturaService.calcularDescuento()).
    const cargosConBeca = await this.ds.query<any[]>(
      `SELECT concepto FROM ed_cargos WHERE "empresaId" = $1 AND concepto LIKE '%beca:%'`,
      [empresaId],
    );
    let montoTotalOtorgado = 0;
    for (const { concepto } of cargosConBeca) {
      for (const parte of String(concepto).split(';')) {
        if (!parte.startsWith('beca:')) continue;
        const monto = Number(parte.split(':')[2]);
        if (!Number.isNaN(monto)) montoTotalOtorgado += monto;
      }
    }

    return { listado, montoTotalOtorgado: Math.round(montoTotalOtorgado * 100) / 100 };
  }

  // ── 14. Productividad docente (grupos, estudiantes — NO calidad) ─────────
  // Solo carga: cuántas secciones/asignaturas tiene asignadas y cuántos
  // estudiantes hay en esas secciones. No hay ninguna métrica de desempeño
  // (promedio de sus estudiantes, aprobación, etc.) a propósito.

  async productividadDocente(empresaId: number, opts: { anioEscolarId?: number } = {}) {
    const anioCond = opts.anioEscolarId ? `AND me."anioEscolarId" = $2` : '';
    const params = opts.anioEscolarId ? [empresaId, opts.anioEscolarId] : [empresaId];

    return this.ds.query<any[]>(
      `SELECT d.id AS "docenteId", d.nombres || ' ' || d.apellidos AS docente, d.especialidad,
              COUNT(DISTINCT sm."seccionId")::int AS secciones,
              COUNT(DISTINCT sm."asignaturaId")::int AS asignaturas,
              COUNT(DISTINCT me."estudianteId")::int AS estudiantes
       FROM ed_docentes d
       LEFT JOIN ed_asignaciones_docente sm ON sm."docenteId" = d.id AND sm."isActive" = true
       LEFT JOIN ed_matriculas me ON me."seccionId" = sm."seccionId" AND me.estado = 'activa' ${anioCond}
       WHERE d."empresaId" = $1 AND d."isActive" = true
       GROUP BY d.id, d.nombres, d.apellidos, d.especialidad
       ORDER BY estudiantes DESC`,
      params,
    );
  }
}
