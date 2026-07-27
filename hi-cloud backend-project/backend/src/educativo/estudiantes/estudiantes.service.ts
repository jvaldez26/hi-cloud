import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class EstudiantesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(empresaId: number, q?: string, gradoId?: number, isActive?: boolean) {
    const conds: string[] = [`e."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (q) {
      conds.push(`(e.nombres ILIKE $${idx} OR e.apellidos ILIKE $${idx} OR e.cedula ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }
    if (gradoId !== undefined) {
      conds.push(`m."gradoId" = $${idx}`); params.push(gradoId); idx++;
    }
    if (isActive !== undefined) {
      conds.push(`e."isActive" = $${idx}`); params.push(isActive); idx++;
    }
    return this.ds.query<any[]>(
      `SELECT e.id, e.nombres, e.apellidos, e.sexo, e."fechaNacimiento",
              e.cedula, e.foto, e.telefono, e.email, e."isActive", e."createdAt",
              EXTRACT(YEAR FROM AGE(e."fechaNacimiento"))::int AS edad,
              m."gradoId", g.nombre AS "gradoNombre",
              m."seccionId", s.nombre AS "seccionNombre"
       FROM ed_estudiantes e
       LEFT JOIN LATERAL (
         SELECT "gradoId", "seccionId" FROM ed_matriculas
         WHERE "estudianteId" = e.id AND "empresaId" = $1
         ORDER BY "fechaMatricula" DESC LIMIT 1
       ) m ON true
       LEFT JOIN ed_grados g ON g.id = m."gradoId"
       LEFT JOIN ed_secciones s ON s.id = m."seccionId"
       WHERE ${conds.join(' AND ')}
       ORDER BY e.apellidos, e.nombres`,
      params,
    );
  }

  async findOne(empresaId: number, id: number) {
    const [est] = await this.ds.query<any[]>(
      `SELECT e.*,
              EXTRACT(YEAR FROM AGE(e."fechaNacimiento"))::int AS edad
       FROM ed_estudiantes e
       WHERE e.id = $1 AND e."empresaId" = $2`,
      [id, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');

    const [tutores, matriculas] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT t.id, t.nombres, t.apellidos, t.cedula, t.telefono, t.email,
                t.parentesco, et."esPrincipal"
         FROM ed_tutores t
         JOIN ed_estudiante_tutores et ON et."tutorId" = t.id
         WHERE et."estudianteId" = $1
         ORDER BY et."esPrincipal" DESC, t.apellidos`,
        [id],
      ),
      this.ds.query<any[]>(
        `SELECT m.*, g.nombre AS "gradoNombre", s.nombre AS "seccionNombre",
                a.nombre AS "anioNombre"
         FROM ed_matriculas m
         LEFT JOIN ed_grados g ON g.id = m."gradoId"
         LEFT JOIN ed_secciones s ON s.id = m."seccionId"
         LEFT JOIN ed_anios_escolares a ON a.id = m."anioEscolarId"
         WHERE m."estudianteId" = $1 AND m."empresaId" = $2
         ORDER BY m."fechaMatricula" DESC`,
        [id, empresaId],
      ),
    ]);

    return { ...est, tutores, matriculas };
  }

  async create(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_estudiantes (
         "empresaId", nombres, apellidos, sexo, "fechaNacimiento", cedula, foto,
         direccion, telefono, email, "grupoSanguineo", alergias, condiciones, notas
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        empresaId, dto.nombres, dto.apellidos,
        dto.sexo ?? null, dto.fechaNacimiento ?? null, dto.cedula ?? null,
        dto.foto ?? null, dto.direccion ?? null, dto.telefono ?? null,
        dto.email ?? null, dto.grupoSanguineo ?? null,
        dto.alergias ?? null, dto.condiciones ?? null, dto.notas ?? null,
      ],
    );
    return row;
  }

  async update(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Estudiante no encontrado');
    const FIELDS = [
      'nombres', 'apellidos', 'sexo', 'fechaNacimiento', 'cedula', 'foto',
      'direccion', 'telefono', 'email', 'grupoSanguineo', 'alergias',
      'condiciones', 'notas', 'isActive',
    ];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return this.findOne(empresaId, id);
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    await this.ds.query(
      `UPDATE ed_estudiantes SET ${sets} WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return this.findOne(empresaId, id);
  }

  async addTutor(empresaId: number, estudianteId: number, tutorId: number, esPrincipal: boolean) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');
    await this.ds.query(
      `INSERT INTO ed_estudiante_tutores ("estudianteId","tutorId","esPrincipal")
       VALUES ($1,$2,$3)
       ON CONFLICT ("estudianteId","tutorId") DO UPDATE SET "esPrincipal" = $3`,
      [estudianteId, tutorId, esPrincipal ?? false],
    );
    return this.findOne(empresaId, estudianteId);
  }

  async removeTutor(empresaId: number, estudianteId: number, tutorId: number) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');
    await this.ds.query(
      `DELETE FROM ed_estudiante_tutores WHERE "estudianteId" = $1 AND "tutorId" = $2`,
      [estudianteId, tutorId],
    );
    return { ok: true };
  }
}
