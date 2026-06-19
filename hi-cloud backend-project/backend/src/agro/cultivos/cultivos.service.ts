import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class CultivosService {
  private readonly logger = new Logger(CultivosService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async findAll(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM ag_cultivos WHERE "empresaId"=$1 AND "isActive"=true ORDER BY nombre`,
      [empresaId],
    );
  }

  async create(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_cultivos ("empresaId",nombre,variedad,tipo,"diasCicloPromedio",
         "rendimientoEsperado","unidadRendimiento","unidadPorArea")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [empresaId, data.nombre, data.variedad ?? null, data.tipo ?? null,
       data.diasCicloPromedio ?? null, data.rendimientoEsperado ?? null,
       data.unidadRendimiento ?? null, data.unidadPorArea ?? null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ag_cultivos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!exists) throw new NotFoundException(`Cultivo #${id} no encontrado`);
    const allowed = ['nombre','variedad','tipo','diasCicloPromedio','rendimientoEsperado',
      'unidadRendimiento','unidadPorArea','isActive'];
    const sets: string[] = [];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    if (!sets.length) return exists;
    const [row] = await this.ds.query(
      `UPDATE ag_cultivos SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, vals,
    );
    return row;
  }
}
