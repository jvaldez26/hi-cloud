import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

@Injectable()
export class MatriculasService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(empresaId: number, opts: {
    anioEscolarId?: number;
    gradoId?: number;
    seccionId?: number;
    estado?: string;
    q?: string;
  } = {}) {
    const conds: string[] = [`m."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;

    if (opts.anioEscolarId) { conds.push(`m."anioEscolarId" = $${idx}`); params.push(opts.anioEscolarId); idx++; }
    if (opts.gradoId)       { conds.push(`m."gradoId" = $${idx}`);        params.push(opts.gradoId);       idx++; }
    if (opts.seccionId)     { conds.push(`m."seccionId" = $${idx}`);      params.push(opts.seccionId);     idx++; }
    if (opts.estado)        { conds.push(`m.estado = $${idx}`);           params.push(opts.estado);        idx++; }
    if (opts.q) {
      conds.push(`(e.nombres ILIKE $${idx} OR e.apellidos ILIKE $${idx} OR e.cedula ILIKE $${idx})`);
      params.push(`%${opts.q}%`); idx++;
    }

    return this.ds.query<any[]>(
      `SELECT m.*,
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              e.cedula AS "estudianteCedula", e.foto AS "estudianteFoto",
              g.nombre AS "gradoNombre",
              s.nombre AS "seccionNombre",
              a.nombre AS "anioNombre"
       FROM ed_matriculas m
       JOIN ed_estudiantes e  ON e.id  = m."estudianteId"
       LEFT JOIN ed_grados g  ON g.id  = m."gradoId"
       LEFT JOIN ed_secciones s ON s.id = m."seccionId"
       LEFT JOIN ed_anios_escolares a ON a.id = m."anioEscolarId"
       WHERE ${conds.join(' AND ')}
       ORDER BY a."fechaInicio" DESC, g.orden, e.apellidos, e.nombres`,
      params,
    );
  }

  async findOne(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT m.*,
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              e.cedula AS "estudianteCedula",
              g.nombre AS "gradoNombre",
              s.nombre AS "seccionNombre",
              a.nombre AS "anioNombre"
       FROM ed_matriculas m
       JOIN ed_estudiantes e  ON e.id  = m."estudianteId"
       LEFT JOIN ed_grados g  ON g.id  = m."gradoId"
       LEFT JOIN ed_secciones s ON s.id = m."seccionId"
       LEFT JOIN ed_anios_escolares a ON a.id = m."anioEscolarId"
       WHERE m.id = $1 AND m."empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException('Matrícula no encontrada');
    return row;
  }

  async create(empresaId: number, dto: any) {
    const [estudiante] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2 AND "isActive" = true`,
      [dto.estudianteId, empresaId],
    );
    if (!estudiante) throw new NotFoundException('Estudiante no encontrado o inactivo');

    if (dto.anioEscolarId) {
      const [existing] = await this.ds.query<any[]>(
        `SELECT id FROM ed_matriculas
         WHERE "estudianteId" = $1 AND "anioEscolarId" = $2 AND "empresaId" = $3 AND estado = 'activa'`,
        [dto.estudianteId, dto.anioEscolarId, empresaId],
      );
      if (existing) throw new ConflictException('El estudiante ya tiene una matrícula activa para este año escolar');
    }

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_matriculas (
         "empresaId", "estudianteId", "anioEscolarId", "gradoId", "seccionId",
         "fechaMatricula", estado, "tipoBeca", "porcentajeBeca", observaciones
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        empresaId,
        dto.estudianteId,
        dto.anioEscolarId ?? null,
        dto.gradoId ?? null,
        dto.seccionId ?? null,
        dto.fechaMatricula ?? fechaHoyRD(),
        dto.estado ?? 'activa',
        dto.tipoBeca ?? 'ninguna',
        dto.porcentajeBeca ?? 0,
        dto.observaciones ?? null,
      ],
    );
    return this.findOne(empresaId, row.id);
  }

  async update(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_matriculas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Matrícula no encontrada');

    const FIELDS = ['gradoId', 'seccionId', 'anioEscolarId', 'fechaMatricula',
                    'estado', 'tipoBeca', 'porcentajeBeca', 'observaciones'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return this.findOne(empresaId, id);
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    await this.ds.query(
      `UPDATE ed_matriculas SET ${sets} WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return this.findOne(empresaId, id);
  }

  async stats(empresaId: number, anioEscolarId?: number) {
    const where = anioEscolarId
      ? `m."empresaId" = $1 AND m."anioEscolarId" = $2 AND m.estado = 'activa'`
      : `m."empresaId" = $1 AND m.estado = 'activa'`;
    const params = anioEscolarId ? [empresaId, anioEscolarId] : [empresaId];

    const [resumen] = await this.ds.query<any[]>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE m."tipoBeca" != 'ninguna')::int AS "conBeca",
         COUNT(*) FILTER (WHERE m.sexo = 'M')::int AS masculinos,
         COUNT(*) FILTER (WHERE m.sexo = 'F')::int AS femeninos
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE ${where}`,
      params,
    );

    const porGrado = await this.ds.query<any[]>(
      `SELECT g.nombre AS grado, COUNT(m.id)::int AS total
       FROM ed_matriculas m
       LEFT JOIN ed_grados g ON g.id = m."gradoId"
       WHERE ${where}
       GROUP BY g.id, g.nombre, g.orden
       ORDER BY g.orden`,
      params,
    );

    return { resumen, porGrado };
  }
}
