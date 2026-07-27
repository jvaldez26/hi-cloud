import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AcademicoService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ── Evaluaciones ────────────────────────────────────────────────────────────

  async listEvaluaciones(empresaId: number, opts: {
    seccionId?: number; asignaturaId?: number; periodoId?: number;
  } = {}) {
    const conds: string[] = [`"empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.seccionId)    { conds.push(`"seccionId" = $${idx}`);    params.push(opts.seccionId);    idx++; }
    if (opts.asignaturaId) { conds.push(`"asignaturaId" = $${idx}`); params.push(opts.asignaturaId); idx++; }
    if (opts.periodoId)    { conds.push(`"periodoId" = $${idx}`);    params.push(opts.periodoId);    idx++; }
    return this.ds.query<any[]>(
      `SELECT ev.*,
              a.nombre AS "asignaturaNombre",
              p.nombre AS "periodoNombre"
       FROM ed_evaluaciones ev
       LEFT JOIN ed_asignaturas a ON a.id = ev."asignaturaId"
       LEFT JOIN ed_periodos p    ON p.id = ev."periodoId"
       WHERE ${conds.join(' AND ')}
       ORDER BY ev.fecha, ev.nombre`,
      params,
    );
  }

  async createEvaluacion(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_evaluaciones (
         "empresaId","seccionId","asignaturaId","periodoId",
         nombre, tipo, fecha, "valorMaximo", porcentaje
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        empresaId, dto.seccionId, dto.asignaturaId, dto.periodoId ?? null,
        dto.nombre, dto.tipo ?? 'evaluacion',
        dto.fecha ?? null, dto.valorMaximo ?? 100, dto.porcentaje ?? 100,
      ],
    );
    return row;
  }

  async updateEvaluacion(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_evaluaciones WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Evaluación no encontrada');
    const FIELDS = ['nombre', 'tipo', 'fecha', 'valorMaximo', 'porcentaje', 'isActive'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return exists;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `UPDATE ed_evaluaciones SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }

  // ── Planilla de notas ───────────────────────────────────────────────────────

  async getPlanilla(empresaId: number, seccionId: number, asignaturaId: number, periodoId?: number) {
    const evalConds: string[] = [
      `ev."empresaId" = $1`, `ev."seccionId" = $2`, `ev."asignaturaId" = $3`,
    ];
    const evalParams: any[] = [empresaId, seccionId, asignaturaId];
    if (periodoId) { evalConds.push(`ev."periodoId" = $4`); evalParams.push(periodoId); }

    const evaluaciones = await this.ds.query<any[]>(
      `SELECT ev.* FROM ed_evaluaciones ev WHERE ${evalConds.join(' AND ')} ORDER BY ev.fecha`,
      evalParams,
    );

    const estudiantes = await this.ds.query<any[]>(
      `SELECT e.id, e.nombres, e.apellidos, e.cedula
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."seccionId" = $1 AND m."empresaId" = $2 AND m.estado = 'activa'
       ORDER BY e.apellidos, e.nombres`,
      [seccionId, empresaId],
    );

    if (!evaluaciones.length || !estudiantes.length) {
      return { evaluaciones, estudiantes, calificaciones: [] };
    }

    const evalIds = evaluaciones.map((e: any) => e.id);
    const calificaciones = await this.ds.query<any[]>(
      `SELECT c."evaluacionId", c."estudianteId", c.nota, c.id
       FROM ed_calificaciones c
       WHERE c."evaluacionId" = ANY($1) AND c."empresaId" = $2`,
      [evalIds, empresaId],
    );

    return { evaluaciones, estudiantes, calificaciones };
  }

  async bulkCalificaciones(empresaId: number, items: Array<{
    evaluacionId: number; estudianteId: number; nota: number;
  }>) {
    if (!items.length) return { saved: 0 };
    let saved = 0;
    for (const item of items) {
      await this.ds.query(
        `INSERT INTO ed_calificaciones ("empresaId","evaluacionId","estudianteId",nota)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT ("evaluacionId","estudianteId") DO UPDATE SET nota = $4`,
        [empresaId, item.evaluacionId, item.estudianteId, item.nota],
      );
      saved++;
    }
    return { saved };
  }

  // ── Asistencia ──────────────────────────────────────────────────────────────

  async getAsistencia(empresaId: number, seccionId: number, fecha: string) {
    const estudiantes = await this.ds.query<any[]>(
      `SELECT e.id, e.nombres, e.apellidos, e.cedula, e.foto
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."seccionId" = $1 AND m."empresaId" = $2 AND m.estado = 'activa'
       ORDER BY e.apellidos, e.nombres`,
      [seccionId, empresaId],
    );

    const registros = await this.ds.query<any[]>(
      `SELECT a."estudianteId", a.estado, a.observaciones, a.id
       FROM ed_asistencia a
       WHERE a."seccionId" = $1 AND a.fecha = $2 AND a."empresaId" = $3`,
      [seccionId, fecha, empresaId],
    );

    const map = new Map(registros.map((r: any) => [r.estudianteId, r]));
    return estudiantes.map((e: any) => ({
      ...e,
      asistencia: map.get(e.id) ?? null,
    }));
  }

  async bulkAsistencia(empresaId: number, seccionId: number, fecha: string,
    items: Array<{ estudianteId: number; estado: string; observaciones?: string }>) {
    let saved = 0;
    for (const item of items) {
      await this.ds.query(
        `INSERT INTO ed_asistencia ("empresaId","estudianteId","seccionId",fecha,estado,observaciones)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT ("estudianteId","seccionId",fecha) DO UPDATE SET estado = $5, observaciones = $6`,
        [empresaId, item.estudianteId, seccionId, fecha, item.estado, item.observaciones ?? null],
      );
      saved++;
    }
    return { saved };
  }

  async statsAsistencia(empresaId: number, seccionId: number, opts: {
    fechaInicio?: string; fechaFin?: string;
  } = {}) {
    const asisParams: any[] = [empresaId, seccionId];
    const asisConds: string[] = [`"empresaId" = $1`, `"seccionId" = $2`];
    let idx = 3;
    if (opts.fechaInicio) { asisConds.push(`fecha >= $${idx}`); asisParams.push(opts.fechaInicio); idx++; }
    if (opts.fechaFin)    { asisConds.push(`fecha <= $${idx}`); asisParams.push(opts.fechaFin);    idx++; }

    const matParams: any[] = [...asisParams];
    const matSeccionIdx = idx; matParams.push(seccionId);
    const matEmpresaIdx = idx + 1; matParams.push(empresaId);

    return this.ds.query<any[]>(
      `WITH asist AS (
         SELECT "estudianteId", estado FROM ed_asistencia
         WHERE ${asisConds.join(' AND ')}
       )
       SELECT
         e.id AS "estudianteId",
         e.apellidos || ', ' || e.nombres AS nombre,
         COUNT(a.*) FILTER (WHERE a.estado = 'presente')::int    AS presentes,
         COUNT(a.*) FILTER (WHERE a.estado = 'ausente')::int     AS ausentes,
         COUNT(a.*) FILTER (WHERE a.estado = 'tardanza')::int    AS tardanzas,
         COUNT(a.*) FILTER (WHERE a.estado = 'justificado')::int AS justificados,
         COUNT(a.*)::int AS total
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       LEFT JOIN asist a ON a."estudianteId" = e.id
       WHERE m."seccionId" = $${matSeccionIdx} AND m."empresaId" = $${matEmpresaIdx} AND m.estado = 'activa'
       GROUP BY e.id, e.apellidos, e.nombres
       ORDER BY e.apellidos, e.nombres`,
      matParams,
    );
  }
}
