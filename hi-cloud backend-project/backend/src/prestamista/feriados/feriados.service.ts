import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { feriadosDeFabrica } from '../motor/feriados.util';

/**
 * Motor v2 (Etapa 2, Fase 2B) — calendario de feriados por empresa y año.
 * Ver docs/prestamista/motor-financiero.md §1.5.
 */
@Injectable()
export class FeriadosService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Lista el calendario de un año — si la empresa nunca lo abrió, lo crea
   * con los feriados "de fábrica" (fijos + los dos calculados por Pascua +
   * los 3 trasladables en blanco, sin confirmar).
   */
  async listarAnio(empresaId: number, anio: number) {
    const existentes = await this.ds.query(
      `SELECT * FROM pr_feriados WHERE "empresaId"=$1 AND anio=$2 ORDER BY fecha`, [empresaId, anio],
    );
    if (existentes.length > 0) return existentes;

    const defecto = feriadosDeFabrica(anio);
    for (const f of defecto) {
      await this.ds.query(
        `INSERT INTO pr_feriados ("empresaId", anio, fecha, nombre, confirmado) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT ("empresaId", anio, fecha) DO NOTHING`,
        [empresaId, anio, f.fecha, f.nombre, f.confirmado],
      );
    }
    return this.ds.query(`SELECT * FROM pr_feriados WHERE "empresaId"=$1 AND anio=$2 ORDER BY fecha`, [empresaId, anio]);
  }

  async crear(empresaId: number, data: { anio: number; fecha: string; nombre: string }) {
    const [row] = await this.ds.query(
      `INSERT INTO pr_feriados ("empresaId", anio, fecha, nombre, confirmado) VALUES ($1,$2,$3,$4,true) RETURNING *`,
      [empresaId, data.anio, data.fecha, data.nombre],
    );
    return row;
  }

  async actualizar(empresaId: number, id: number, data: { fecha?: string; nombre?: string; confirmado?: boolean }) {
    const [existente] = await this.ds.query(`SELECT 1 FROM pr_feriados WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    if (!existente) throw new NotFoundException(`Feriado #${id} no encontrado`);

    const allowed = ['fecha', 'nombre', 'confirmado'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if ((data as any)[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push((data as any)[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `WITH fila AS (UPDATE pr_feriados SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *) SELECT * FROM fila`,
      args,
    );
    return row;
  }

  async eliminar(empresaId: number, id: number) {
    const res = await this.ds.query(`DELETE FROM pr_feriados WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    return { success: true };
  }

  /**
   * Set de fechas de feriados CONFIRMADOS de la empresa, para los años dados
   * — lo que usa el motor al generar fechas de una frecuencia diaria con
   * excluirFeriados=true. Crea el calendario "de fábrica" de cada año si
   * todavía no existe (mismo criterio que listarAnio).
   */
  async obtenerSetFeriados(empresaId: number, anios: number[]): Promise<Set<string>> {
    const set = new Set<string>();
    for (const anio of [...new Set(anios)]) {
      const filas = await this.listarAnio(empresaId, anio);
      for (const f of filas) if (f.confirmado) set.add(typeof f.fecha === 'string' ? f.fecha : f.fecha.toISOString().split('T')[0]);
    }
    return set;
  }
}
