import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TutoresService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(empresaId: number, q?: string) {
    const conds: string[] = [`"empresaId" = $1`];
    const params: any[] = [empresaId];
    if (q) {
      conds.push(`(nombres ILIKE $2 OR apellidos ILIKE $2 OR cedula ILIKE $2 OR telefono ILIKE $2)`);
      params.push(`%${q}%`);
    }
    return this.ds.query<any[]>(
      `SELECT t.*,
              COUNT(et."estudianteId")::int AS "totalEstudiantes"
       FROM ed_tutores t
       LEFT JOIN ed_estudiante_tutores et ON et."tutorId" = t.id
       WHERE ${conds.join(' AND ')}
       GROUP BY t.id
       ORDER BY t.apellidos, t.nombres`,
      params,
    );
  }

  async findOne(empresaId: number, id: number) {
    const [tutor] = await this.ds.query<any[]>(
      `SELECT * FROM ed_tutores WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!tutor) throw new NotFoundException('Tutor no encontrado');

    const estudiantes = await this.ds.query<any[]>(
      `SELECT e.id, e.nombres, e.apellidos, e.cedula, et."esPrincipal"
       FROM ed_estudiantes e
       JOIN ed_estudiante_tutores et ON et."estudianteId" = e.id
       WHERE et."tutorId" = $1 AND e."empresaId" = $2
       ORDER BY e.apellidos, e.nombres`,
      [id, empresaId],
    );
    return { ...tutor, estudiantes };
  }

  async create(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_tutores (
         "empresaId", nombres, apellidos, cedula, telefono, email, direccion, parentesco
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        empresaId, dto.nombres, dto.apellidos,
        dto.cedula ?? null, dto.telefono ?? null, dto.email ?? null,
        dto.direccion ?? null, dto.parentesco ?? null,
      ],
    );
    return row;
  }

  async update(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_tutores WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Tutor no encontrado');
    const FIELDS = ['nombres', 'apellidos', 'cedula', 'telefono', 'email', 'direccion', 'parentesco', 'isActive'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return this.findOne(empresaId, id);
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `UPDATE ed_tutores SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }
}
