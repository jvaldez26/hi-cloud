import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DocentesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(empresaId: number, q?: string) {
    const conds: string[] = [`"empresaId" = $1`];
    const params: any[] = [empresaId];
    if (q) {
      conds.push(`(nombres ILIKE $2 OR apellidos ILIKE $2 OR cedula ILIKE $2 OR especialidad ILIKE $2)`);
      params.push(`%${q}%`);
    }
    return this.ds.query<any[]>(
      `SELECT d.*,
              COUNT(DISTINCT sm."seccionId")::int AS "totalSecciones"
       FROM ed_docentes d
       LEFT JOIN ed_seccion_materias sm ON sm."docenteId" = d.id
       WHERE ${conds.join(' AND ')}
       GROUP BY d.id
       ORDER BY d.apellidos, d.nombres`,
      params,
    );
  }

  async findOne(empresaId: number, id: number) {
    const [doc] = await this.ds.query<any[]>(
      `SELECT * FROM ed_docentes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!doc) throw new NotFoundException('Docente no encontrado');

    const secciones = await this.ds.query<any[]>(
      `SELECT sm.*, s.nombre AS "seccionNombre", g.nombre AS "gradoNombre",
              a.nombre AS "asignaturaNombre"
       FROM ed_seccion_materias sm
       JOIN ed_secciones s ON s.id = sm."seccionId"
       LEFT JOIN ed_grados g ON g.id = s."gradoId"
       LEFT JOIN ed_asignaturas a ON a.id = sm."asignaturaId"
       WHERE sm."docenteId" = $1 AND sm."empresaId" = $2`,
      [id, empresaId],
    );
    return { ...doc, secciones };
  }

  async create(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_docentes (
         "empresaId", nombres, apellidos, cedula, telefono, email, especialidad, titulo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        empresaId, dto.nombres, dto.apellidos,
        dto.cedula ?? null, dto.telefono ?? null, dto.email ?? null,
        dto.especialidad ?? null, dto.titulo ?? null,
      ],
    );
    return row;
  }

  async update(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_docentes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Docente no encontrado');
    const FIELDS = ['nombres', 'apellidos', 'cedula', 'telefono', 'email', 'especialidad', 'titulo', 'isActive'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return this.findOne(empresaId, id);
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `UPDATE ed_docentes SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }
}
