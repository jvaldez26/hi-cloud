import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class FincasService {
  private readonly logger = new Logger(FincasService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM ag_fincas WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Finca #${id} no encontrada`);
    return row;
  }

  async findAll(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT f.*, (SELECT COUNT(*) FROM ag_parcelas p WHERE p."fincaId"=f.id AND p."isActive"=true) AS "totalParcelas"
         FROM ag_fincas f WHERE f."empresaId"=$1 AND f."isActive"=true ORDER BY f.nombre`,
      [empresaId],
    );
  }

  async findOne(empresaId: number, id: number) {
    const finca = await this.orFail(empresaId, id);
    const parcelas = await this.ds.query<any[]>(
      `SELECT * FROM ag_parcelas WHERE "fincaId"=$1 AND "empresaId"=$2 AND "isActive"=true ORDER BY nombre`,
      [id, empresaId],
    );
    return { ...finca, parcelas };
  }

  async create(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_fincas ("empresaId",nombre,ubicacion,provincia,municipio,"areaTotal","unidadArea",
         latitud,longitud,"tieneRiego","tipoRiego","fuenteAgua",encargado,"encargadoTelefono",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, data.nombre, data.ubicacion ?? null, data.provincia ?? null, data.municipio ?? null,
       data.areaTotal ?? null, data.unidadArea ?? 'tarea', data.latitud ?? null, data.longitud ?? null,
       data.tieneRiego ?? false, data.tipoRiego ?? null, data.fuenteAgua ?? null,
       data.encargado ?? null, data.encargadoTelefono ?? null, data.notas ?? null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.orFail(empresaId, id);
    const allowed = ['nombre','ubicacion','provincia','municipio','areaTotal','unidadArea','latitud','longitud',
      'tieneRiego','tipoRiego','fuenteAgua','encargado','encargadoTelefono','notas','isActive'];
    const sets: string[] = [];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    if (!sets.length) return this.orFail(empresaId, id);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ag_fincas SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *
       ) SELECT * FROM fila`, vals,
    );
    return row;
  }

  // ── Parcelas ────────────────────────────────────────────────────────────
  async findParcelas(empresaId: number, fincaId?: number) {
    const where = fincaId
      ? `"empresaId"=$1 AND "fincaId"=$2 AND "isActive"=true`
      : `"empresaId"=$1 AND "isActive"=true`;
    const args = fincaId ? [empresaId, fincaId] : [empresaId];
    return this.ds.query<any[]>(`SELECT * FROM ag_parcelas WHERE ${where} ORDER BY nombre`, args);
  }

  async createParcela(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_parcelas ("empresaId","fincaId",nombre,codigo,area,"unidadArea","tipoSuelo","phSuelo",estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [empresaId, data.fincaId ?? null, data.nombre, data.codigo ?? null, data.area ?? null,
       data.unidadArea ?? 'tarea', data.tipoSuelo ?? null, data.phSuelo ?? null, data.estado ?? 'disponible'],
    );
    return row;
  }

  async updateParcela(empresaId: number, id: number, data: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ag_parcelas WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!exists) throw new NotFoundException(`Parcela #${id} no encontrada`);
    const allowed = ['nombre','codigo','area','unidadArea','tipoSuelo','phSuelo','estado','cultivoActual','isActive'];
    const sets: string[] = [];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    if (!sets.length) return exists;
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ag_parcelas SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *
       ) SELECT * FROM fila`, vals,
    );
    return row;
  }
}
