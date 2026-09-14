import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface BecaAplicable {
  estudianteBecaId: number;
  becaId: number;
  nombre: string;
  tipo: string;   // 'porcentaje' | 'monto_fijo'
  valor: number;
}

@Injectable()
export class BecasService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ── Catálogo (ed_becas) ────────────────────────────────────────────────────

  async listBecas(empresaId: number, isActive?: boolean) {
    const conds = [`"empresaId" = $1`];
    const params: any[] = [empresaId];
    if (isActive !== undefined) { conds.push(`"isActive" = $2`); params.push(isActive); }
    return this.ds.query<any[]>(
      `SELECT * FROM ed_becas WHERE ${conds.join(' AND ')} ORDER BY nombre`,
      params,
    );
  }

  async createBeca(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_becas ("empresaId", nombre, tipo, valor, "aplicaA", descripcion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [empresaId, dto.nombre, dto.tipo, dto.valor, dto.aplicaA, dto.descripcion ?? null],
    );
    return row;
  }

  async updateBeca(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_becas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Beca no encontrada');
    const FIELDS = ['nombre', 'tipo', 'valor', 'aplicaA', 'descripcion', 'isActive'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return exists;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_becas SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }

  // ── Asignación a estudiantes (ed_estudiante_becas) ────────────────────────

  async listAsignaciones(empresaId: number, opts: { estudianteId?: number; anioEscolarId?: number } = {}) {
    const conds = [`eb."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.estudianteId)  { conds.push(`eb."estudianteId" = $${idx}`);  params.push(opts.estudianteId);  idx++; }
    if (opts.anioEscolarId) { conds.push(`eb."anioEscolarId" = $${idx}`); params.push(opts.anioEscolarId); idx++; }
    return this.ds.query<any[]>(
      `SELECT eb.*,
              b.nombre AS "becaNombre", b.tipo AS "becaTipo", b.valor AS "becaValor", b."aplicaA" AS "becaAplicaA",
              e.nombres || ' ' || e.apellidos AS "estudianteNombre"
       FROM ed_estudiante_becas eb
       JOIN ed_becas b ON b.id = eb."becaId"
       JOIN ed_estudiantes e ON e.id = eb."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY eb."fechaAsignacion" DESC`,
      params,
    );
  }

  async asignarBeca(empresaId: number, dto: any) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [dto.estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');
    const [beca] = await this.ds.query<any[]>(
      `SELECT id FROM ed_becas WHERE id = $1 AND "empresaId" = $2`,
      [dto.becaId, empresaId],
    );
    if (!beca) throw new NotFoundException('Beca no encontrada');

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_estudiante_becas (
         "empresaId","estudianteId","becaId","anioEscolarId","fechaAsignacion",motivo,"aprobadoPor"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [empresaId, dto.estudianteId, dto.becaId, dto.anioEscolarId ?? null,
       dto.fechaAsignacion ?? new Date().toISOString().slice(0, 10),
       dto.motivo ?? null, dto.aprobadoPor ?? null],
    );
    return row;
  }

  async updateAsignacion(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiante_becas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Asignación de beca no encontrada');
    const FIELDS = ['motivo', 'aprobadoPor', 'isActive'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return exists;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_estudiante_becas SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }

  // ── Cálculo — usado por colegiatura.service.ts al generar cargos ─────────

  /**
   * Becas activas del estudiante para ese año escolar que aplican al tipo de
   * cargo dado ('colegiatura' | 'inscripcion'). Una beca con aplicaA='ambos'
   * cuenta para los dos. anioEscolarId puede ser NULL en la asignación (beca
   * indefinida, no atada a un año puntual) — esas también cuentan siempre.
   */
  async becasAplicables(
    empresaId: number, estudianteId: number, anioEscolarId: number | null,
    aplicaA: 'colegiatura' | 'inscripcion',
  ): Promise<BecaAplicable[]> {
    return this.ds.query<BecaAplicable[]>(
      `SELECT eb.id AS "estudianteBecaId", b.id AS "becaId", b.nombre, b.tipo, b.valor
       FROM ed_estudiante_becas eb
       JOIN ed_becas b ON b.id = eb."becaId"
       WHERE eb."empresaId" = $1 AND eb."estudianteId" = $2
         AND eb."isActive" = true AND b."isActive" = true
         AND (eb."anioEscolarId" IS NULL OR eb."anioEscolarId" = $3)
         AND (b."aplicaA" = $4 OR b."aplicaA" = 'ambos')`,
      [empresaId, estudianteId, anioEscolarId, aplicaA],
    );
  }
}
