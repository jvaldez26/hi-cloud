import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class MaquinariaService {
  private readonly logger = new Logger(MaquinariaService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async findAll(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM ag_maquinaria WHERE "empresaId"=$1 AND "isActive"=true ORDER BY nombre`,
      [empresaId],
    );
  }

  async create(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_maquinaria ("empresaId",nombre,tipo,marca,modelo,anio,
         "costoHora","horasUso","ultimoMantenimiento","proximoMantenimiento",estado,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [empresaId, data.nombre, data.tipo ?? null, data.marca ?? null, data.modelo ?? null,
       data.anio ?? null, data.costoHora ?? null, data.horasUso ?? 0,
       data.ultimoMantenimiento ?? null, data.proximoMantenimiento ?? null,
       data.estado ?? 'operativo', data.notas ?? null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ag_maquinaria WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!exists) throw new NotFoundException(`Maquinaria #${id} no encontrada`);
    const allowed = ['nombre','tipo','marca','modelo','anio','costoHora','horasUso',
      'ultimoMantenimiento','proximoMantenimiento','estado','notas','isActive'];
    const sets: string[] = [];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    if (!sets.length) return exists;
    const [row] = await this.ds.query(
      `UPDATE ag_maquinaria SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, vals,
    );
    return row;
  }
}
