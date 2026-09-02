import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class EstructuraService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ── Niveles ─────────────────────────────────────────────────────────────

  async listNiveles(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM ed_niveles WHERE "empresaId" = $1 ORDER BY orden, nombre`,
      [empresaId],
    );
  }

  async createNivel(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_niveles ("empresaId", nombre, orden) VALUES ($1,$2,$3) RETURNING *`,
      [empresaId, dto.nombre, dto.orden ?? 0],
    );
    return row;
  }

  async updateNivel(empresaId: number, id: number, dto: any) {
    const fields = ['nombre', 'orden', 'isActive'].filter(f => dto[f] !== undefined);
    if (!fields.length) throw new NotFoundException('Sin campos a actualizar');
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_niveles SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    if (!row) throw new NotFoundException('Nivel no encontrado');
    return row;
  }

  // ── Grados ──────────────────────────────────────────────────────────────

  async listGrados(empresaId: number, nivelId?: number) {
    const where = nivelId
      ? `WHERE g."empresaId" = $1 AND g."nivelId" = $2`
      : `WHERE g."empresaId" = $1`;
    const params = nivelId ? [empresaId, nivelId] : [empresaId];
    return this.ds.query<any[]>(
      `SELECT g.*, n.nombre AS "nivelNombre"
       FROM ed_grados g
       LEFT JOIN ed_niveles n ON n.id = g."nivelId"
       ${where} ORDER BY n.orden, g.orden, g.nombre`,
      params,
    );
  }

  async createGrado(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_grados ("empresaId","nivelId",nombre,orden) VALUES ($1,$2,$3,$4) RETURNING *`,
      [empresaId, dto.nivelId ?? null, dto.nombre, dto.orden ?? 0],
    );
    return row;
  }

  async updateGrado(empresaId: number, id: number, dto: any) {
    const fields = ['nivelId', 'nombre', 'orden', 'isActive'].filter(f => dto[f] !== undefined);
    if (!fields.length) throw new NotFoundException('Sin campos a actualizar');
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_grados SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    if (!row) throw new NotFoundException('Grado no encontrado');
    return row;
  }

  async setPensum(empresaId: number, gradoId: number, asignaturas: { asignaturaId: number; horasSemanales?: number; orden?: number }[]) {
    await this.ds.query(
      `DELETE FROM ed_grado_asignaturas WHERE "gradoId" = $1 AND "empresaId" = $2`,
      [gradoId, empresaId],
    );
    for (const a of asignaturas) {
      await this.ds.query(
        `INSERT INTO ed_grado_asignaturas ("empresaId","gradoId","asignaturaId","horasSemanales",orden)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [empresaId, gradoId, a.asignaturaId, a.horasSemanales ?? null, a.orden ?? 0],
      );
    }
    return this.getPensum(empresaId, gradoId);
  }

  async getPensum(empresaId: number, gradoId: number) {
    return this.ds.query<any[]>(
      `SELECT ga.*, a.nombre AS "asignaturaNombre", a.area, a.codigo
       FROM ed_grado_asignaturas ga
       JOIN ed_asignaturas a ON a.id = ga."asignaturaId"
       WHERE ga."gradoId" = $1 AND ga."empresaId" = $2
       ORDER BY ga.orden, a.nombre`,
      [gradoId, empresaId],
    );
  }

  // ── Secciones ───────────────────────────────────────────────────────────

  async listSecciones(empresaId: number, gradoId?: number, anioEscolarId?: number) {
    const conditions: string[] = [`s."empresaId" = $1`];
    const params: any[] = [empresaId];
    if (gradoId) { conditions.push(`s."gradoId" = $${params.length + 1}`); params.push(gradoId); }
    if (anioEscolarId) { conditions.push(`s."anioEscolarId" = $${params.length + 1}`); params.push(anioEscolarId); }
    return this.ds.query<any[]>(
      `SELECT s.*,
              g.nombre AS "gradoNombre",
              a.nombre AS "anioNombre",
              (SELECT COUNT(*) FROM ed_matriculas m WHERE m."seccionId" = s.id AND m.estado = 'activa') AS "totalEstudiantes"
       FROM ed_secciones s
       LEFT JOIN ed_grados g ON g.id = s."gradoId"
       LEFT JOIN ed_anios_escolares a ON a.id = s."anioEscolarId"
       WHERE ${conditions.join(' AND ')}
       ORDER BY g.orden, s.nombre`,
      params,
    );
  }

  async createSeccion(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_secciones ("empresaId","gradoId","anioEscolarId",nombre,"capacidadMaxima",aula,"tutorId")
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [empresaId, dto.gradoId, dto.anioEscolarId ?? null, dto.nombre,
       dto.capacidadMaxima ?? 30, dto.aula ?? null, dto.tutorId ?? null],
    );
    return row;
  }

  async updateSeccion(empresaId: number, id: number, dto: any) {
    const fields = ['gradoId', 'anioEscolarId', 'nombre', 'capacidadMaxima', 'aula', 'tutorId', 'isActive'].filter(f => dto[f] !== undefined);
    if (!fields.length) throw new NotFoundException('Sin campos a actualizar');
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_secciones SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    if (!row) throw new NotFoundException('Sección no encontrada');
    return row;
  }

  // ── Asignaturas ─────────────────────────────────────────────────────────

  async listAsignaturas(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM ed_asignaturas WHERE "empresaId" = $1 ORDER BY area, nombre`,
      [empresaId],
    );
  }

  async createAsignatura(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_asignaturas ("empresaId",nombre,codigo,area,"esEvaluable")
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresaId, dto.nombre, dto.codigo ?? null, dto.area ?? null, dto.esEvaluable ?? true],
    );
    return row;
  }

  async updateAsignatura(empresaId: number, id: number, dto: any) {
    const fields = ['nombre', 'codigo', 'area', 'esEvaluable', 'isActive'].filter(f => dto[f] !== undefined);
    if (!fields.length) throw new NotFoundException('Sin campos a actualizar');
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_asignaturas SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    if (!row) throw new NotFoundException('Asignatura no encontrada');
    return row;
  }
}
