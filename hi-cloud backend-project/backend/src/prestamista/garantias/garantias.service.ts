import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class GarantiasService {
  private readonly logger = new Logger(GarantiasService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async findByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT * FROM pr_garantias WHERE "prestamoId"=$1 AND "empresaId"=$2`, [prestamoId, empresaId],
    );
  }

  async findByDeudor(empresaId: number, deudorId: number) {
    return this.ds.query(
      `SELECT * FROM pr_garantias WHERE "deudorId"=$1 AND "empresaId"=$2 ORDER BY "createdAt" DESC`,
      [deudorId, empresaId],
    );
  }

  async findOne(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM pr_garantias WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Garantía #${id} no encontrada`);
    return row;
  }

  async create(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_garantias ("empresaId","prestamoId","solicitudId","deudorId",tipo,descripcion,
        "valorTasado","valorRealizacion",detalles,"documentosUrls","fotosUrls",ubicacion,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.prestamoId ?? null, data.solicitudId ?? null, data.deudorId, data.tipo,
       data.descripcion, data.valorTasado ?? null, data.valorRealizacion ?? null,
       data.detalles ? JSON.stringify(data.detalles) : null,
       data.documentosUrls ? JSON.stringify(data.documentosUrls) : null,
       data.fotosUrls ? JSON.stringify(data.fotosUrls) : null,
       data.ubicacion ?? null, data.notas ?? null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.findOne(empresaId, id);
    const allowed = ['tipo','descripcion','valorTasado','valorRealizacion','estado','ubicacion','notas'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (data.detalles !== undefined) { fields.push(`detalles=$${idx++}`); args.push(JSON.stringify(data.detalles)); }
    if (!fields.length) return this.findOne(empresaId, id);
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE pr_garantias SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`, args,
    );
    return row;
  }
}
