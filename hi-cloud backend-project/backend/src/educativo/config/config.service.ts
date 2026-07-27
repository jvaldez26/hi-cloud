import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class EdConfigService {
  private readonly logger = new Logger(EdConfigService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getConfig(empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM ed_config WHERE "empresaId" = $1`,
      [empresaId],
    );
    return row ?? null;
  }

  async upsertConfig(empresaId: number, dto: any) {
    const existing = await this.getConfig(empresaId);
    if (existing) {
      const sets = Object.keys(dto)
        .filter(k => k !== 'empresaId')
        .map((k, i) => `"${k}" = $${i + 2}`)
        .join(', ');
      const vals = Object.keys(dto).filter(k => k !== 'empresaId').map(k => dto[k]);
      await this.ds.query(
        `UPDATE ed_config SET ${sets} WHERE "empresaId" = $1`,
        [empresaId, ...vals],
      );
    } else {
      const keys = ['empresaId', ...Object.keys(dto).filter(k => k !== 'empresaId')];
      const vals = [empresaId, ...Object.keys(dto).filter(k => k !== 'empresaId').map(k => dto[k])];
      const cols = keys.map(k => `"${k}"`).join(', ');
      const params = keys.map((_, i) => `$${i + 1}`).join(', ');
      await this.ds.query(`INSERT INTO ed_config (${cols}) VALUES (${params})`, vals);
    }
    return this.getConfig(empresaId);
  }

  // ── Años escolares ──────────────────────────────────────────────────────

  async listAnios(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM ed_anios_escolares WHERE "empresaId" = $1 ORDER BY "fechaInicio" DESC`,
      [empresaId],
    );
  }

  async getAnioActual(empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM ed_anios_escolares WHERE "empresaId" = $1 AND "esActual" = true LIMIT 1`,
      [empresaId],
    );
    return row ?? null;
  }

  async createAnio(empresaId: number, dto: any) {
    if (dto.esActual) {
      await this.ds.query(
        `UPDATE ed_anios_escolares SET "esActual" = false WHERE "empresaId" = $1`,
        [empresaId],
      );
    }
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_anios_escolares ("empresaId", nombre, "fechaInicio", "fechaFin", estado, "esActual")
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [empresaId, dto.nombre, dto.fechaInicio, dto.fechaFin, dto.estado ?? 'planificacion', dto.esActual ?? false],
    );
    return row;
  }

  async updateAnio(empresaId: number, id: number, dto: any) {
    const [existing] = await this.ds.query<any[]>(
      `SELECT id FROM ed_anios_escolares WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!existing) throw new NotFoundException('Año escolar no encontrado');
    if (dto.esActual) {
      await this.ds.query(
        `UPDATE ed_anios_escolares SET "esActual" = false WHERE "empresaId" = $1 AND id != $2`,
        [empresaId, id],
      );
    }
    const fields = ['nombre', 'fechaInicio', 'fechaFin', 'estado', 'esActual'].filter(f => dto[f] !== undefined);
    if (!fields.length) return existing;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `UPDATE ed_anios_escolares SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }

  // ── Periodos ────────────────────────────────────────────────────────────

  async listPeriodos(empresaId: number, anioEscolarId?: number) {
    const where = anioEscolarId
      ? `WHERE "empresaId" = $1 AND "anioEscolarId" = $2`
      : `WHERE "empresaId" = $1`;
    const params = anioEscolarId ? [empresaId, anioEscolarId] : [empresaId];
    return this.ds.query<any[]>(
      `SELECT p.*, a.nombre AS "anioNombre"
       FROM ed_periodos p
       LEFT JOIN ed_anios_escolares a ON a.id = p."anioEscolarId"
       ${where} ORDER BY p."anioEscolarId", p.numero`,
      params,
    );
  }

  async createPeriodo(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_periodos ("empresaId","anioEscolarId",nombre,numero,"fechaInicio","fechaFin",ponderacion,estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [empresaId, dto.anioEscolarId, dto.nombre, dto.numero,
       dto.fechaInicio ?? null, dto.fechaFin ?? null,
       dto.ponderacion ?? 25, dto.estado ?? 'abierto'],
    );
    return row;
  }

  async updatePeriodo(empresaId: number, id: number, dto: any) {
    const [existing] = await this.ds.query<any[]>(
      `SELECT id FROM ed_periodos WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!existing) throw new NotFoundException('Periodo no encontrado');
    const fields = ['nombre', 'numero', 'fechaInicio', 'fechaFin', 'ponderacion', 'estado'].filter(f => dto[f] !== undefined);
    if (!fields.length) return existing;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `UPDATE ed_periodos SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }
}
