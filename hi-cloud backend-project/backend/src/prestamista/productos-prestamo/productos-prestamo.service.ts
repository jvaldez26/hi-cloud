import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ParametrosTasa, FrecuenciaRegular, tasaPeriodoPagoRegular, tasaDiaria, resumenTasaParaMostrar, periodosPorAnioRegular } from '../motor/tasas.util';

const FRECUENCIAS_REGULARES = new Set<string>(['semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual']);

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
      `INSERT INTO pr_productos_prestamo ("empresaId",nombre,"tipoCredito",descripcion,"montoMinimo","montoMaximo",
        "tasaInteresMensual","tipoTasa","plazoMinimoMeses","plazoMaximoMeses","frecuenciaPago",
        "metodoAmortizacion","porcentajeMora","cargoCierre","porcentajeCargoCierre","diasGracia",
        "requiereGarantia","requiereGarante","motorConfig")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [empresaId, data.nombre, data.tipoCredito ?? 'personal', data.descripcion ?? null,
       data.montoMinimo ?? null, data.montoMaximo ?? null,
       data.tasaInteresMensual, data.tipoTasa ?? 'mensual', data.plazoMinimoMeses ?? null,
       data.plazoMaximoMeses ?? null, data.frecuenciaPago ?? 'mensual', data.metodoAmortizacion ?? 'frances',
       data.porcentajeMora ?? 0, data.cargoCierre ?? 0, data.porcentajeCargoCierre ?? 0,
       data.diasGracia ?? 0, data.requiereGarantia ?? false, data.requiereGarante ?? false,
       data.motorConfig ? JSON.stringify(data.motorConfig) : null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.orFail(empresaId, id);
    const allowed = ['nombre','tipoCredito','descripcion','montoMinimo','montoMaximo','tasaInteresMensual','tipoTasa',
      'plazoMinimoMeses','plazoMaximoMeses','frecuenciaPago','metodoAmortizacion','porcentajeMora',
      'cargoCierre','porcentajeCargoCierre','diasGracia','requiereGarantia','requiereGarante','isActive'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (data.motorConfig !== undefined) {
      fields.push(`"motorConfig"=$${idx++}`);
      args.push(data.motorConfig ? JSON.stringify(data.motorConfig) : null);
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

  /** Motor v2 (Fase 2B) — vista previa de tasaEquivalentePorPeriodo/tasaAnualNominal/TEA mientras se edita un producto. */
  vistaTasa(data: { tasa: ParametrosTasa; frecuencia: string }) {
    if (FRECUENCIAS_REGULARES.has(data.frecuencia as any)) {
      const i = tasaPeriodoPagoRegular(data.tasa, data.frecuencia as any);
      return resumenTasaParaMostrar(i, periodosPorAnioRegular(data.frecuencia as any));
    }
    const tDiaria = tasaDiaria(data.tasa);
    return resumenTasaParaMostrar(tDiaria, data.tasa.baseDias);
  }

  async remove(empresaId: number, id: number) {
    await this.orFail(empresaId, id);
    await this.ds.query(
      `UPDATE pr_productos_prestamo SET "isActive"=false WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    return { success: true };
  }
}
