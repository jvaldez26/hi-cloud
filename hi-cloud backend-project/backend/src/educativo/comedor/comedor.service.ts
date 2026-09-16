import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CargosServicioService } from '../common/cargos-servicio.service';

@Injectable()
export class ComedorService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cargosSvc: CargosServicioService,
  ) {}

  /** Mismo campo, mismo truco que transporte: trazabilidad hacia el plan de origen, sin columna nueva en ed_cargos. */
  private conceptoComedor(planId: number) {
    return `comedor:plan=${planId}`;
  }

  async listPlanes(empresaId: number, opts: { estudianteId?: number; isActive?: boolean } = {}) {
    const conds = [`p."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.estudianteId)     { conds.push(`p."estudianteId" = $${idx}`); params.push(opts.estudianteId); idx++; }
    if (opts.isActive !== undefined) { conds.push(`p."isActive" = $${idx}`); params.push(opts.isActive); idx++; }
    return this.ds.query<any[]>(
      `SELECT p.*, e.nombres || ' ' || e.apellidos AS "estudianteNombre"
       FROM ed_comedor_planes p
       JOIN ed_estudiantes e ON e.id = p."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY p."isActive" DESC, e.apellidos`,
      params,
    );
  }

  async createPlan(empresaId: number, dto: any) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [dto.estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');

    const [yaActivo] = await this.ds.query<any[]>(
      `SELECT id FROM ed_comedor_planes WHERE "empresaId" = $1 AND "estudianteId" = $2 AND "isActive" = true`,
      [empresaId, dto.estudianteId],
    );
    if (yaActivo) {
      throw new BadRequestException('El estudiante ya tiene un plan de comedor activo — dalo de baja primero');
    }

    const [plan] = await this.ds.query<any[]>(
      `INSERT INTO ed_comedor_planes (
         "empresaId","estudianteId",tipo,"costoMensual","restriccionesAlimenticias","isActive"
       ) VALUES ($1,$2,$3,$4,$5,true) RETURNING *`,
      [empresaId, dto.estudianteId, dto.tipo, dto.costoMensual, dto.restriccionesAlimenticias ?? null],
    );

    const resultado = await this.cargosSvc.generarCargos(empresaId, {
      estudianteId: plan.estudianteId,
      tipo: 'comedor',
      concepto: this.conceptoComedor(plan.id),
      costoMensual: plan.costoMensual,
      descripcionPrefijo: 'Comedor',
    });
    return { plan, ...resultado };
  }

  async updatePlan(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_comedor_planes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Plan de comedor no encontrado');

    const FIELDS = ['tipo', 'costoMensual', 'restriccionesAlimenticias', 'isActive'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return exists;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_comedor_planes SET ${sets.join(', ')} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }

  /** Baja: desactiva el plan y anula sus cargos futuros sin pagar (ver CargosServicioService). */
  async darDeBaja(empresaId: number, id: number) {
    const [plan] = await this.ds.query<any[]>(
      `SELECT * FROM ed_comedor_planes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!plan) throw new NotFoundException('Plan de comedor no encontrado');
    if (!plan.isActive) throw new BadRequestException('Este plan ya está inactivo');

    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE ed_comedor_planes SET "isActive" = false WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId],
    );

    const { cargosAnulados } = await this.cargosSvc.anularCargosFuturosSinPagar(empresaId, {
      estudianteId: plan.estudianteId,
      tipo: 'comedor',
      concepto: this.conceptoComedor(plan.id),
    });

    return { plan: row, cargosAnulados };
  }
}
