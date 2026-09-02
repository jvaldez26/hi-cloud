import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ProductosPrestamoService {
  private readonly logger = new Logger(ProductosPrestamoService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM pr_productos_prestamo WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Producto préstamo #${id} no encontrado`);
    return row;
  }

  async findAll(empresaId: number) {
    return this.ds.query(
      `SELECT * FROM pr_productos_prestamo WHERE "empresaId"=$1 ORDER BY nombre`, [empresaId],
    );
  }

  async findOne(empresaId: number, id: number) {
    return this.orFail(empresaId, id);
  }

  async create(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_productos_prestamo ("empresaId",nombre,descripcion,"montoMinimo","montoMaximo",
        "tasaInteresMensual","tipoTasa","plazoMinimoMeses","plazoMaximoMeses","frecuenciaPago",
        "metodoAmortizacion","porcentajeMora","cargoCierre","porcentajeCargoCierre","diasGracia",
        "requiereGarantia","requiereGarante")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [empresaId, data.nombre, data.descripcion ?? null, data.montoMinimo ?? null, data.montoMaximo ?? null,
       data.tasaInteresMensual, data.tipoTasa ?? 'mensual', data.plazoMinimoMeses ?? null,
       data.plazoMaximoMeses ?? null, data.frecuenciaPago ?? 'mensual', data.metodoAmortizacion ?? 'frances',
       data.porcentajeMora ?? 0, data.cargoCierre ?? 0, data.porcentajeCargoCierre ?? 0,
       data.diasGracia ?? 0, data.requiereGarantia ?? false, data.requiereGarante ?? false],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.orFail(empresaId, id);
    const allowed = ['nombre','descripcion','montoMinimo','montoMaximo','tasaInteresMensual','tipoTasa',
      'plazoMinimoMeses','plazoMaximoMeses','frecuenciaPago','metodoAmortizacion','porcentajeMora',
      'cargoCierre','porcentajeCargoCierre','diasGracia','requiereGarantia','requiereGarante','isActive'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_productos_prestamo SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *
       ) SELECT * FROM fila`, args,
    );
    return row;
  }

  async remove(empresaId: number, id: number) {
    await this.orFail(empresaId, id);
    await this.ds.query(
      `UPDATE pr_productos_prestamo SET "isActive"=false WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    return { success: true };
  }
}
