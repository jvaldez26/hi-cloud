import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ColegiaturaService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ── Planes de pago ──────────────────────────────────────────────────────────

  async listPlanes(empresaId: number, anioEscolarId?: number) {
    const conds = [`p."empresaId" = $1`];
    const params: any[] = [empresaId];
    if (anioEscolarId) { conds.push(`p."anioEscolarId" = $2`); params.push(anioEscolarId); }
    return this.ds.query<any[]>(
      `SELECT p.*,
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              e.cedula AS "estudianteCedula",
              a.nombre AS "anioNombre",
              (SELECT COUNT(*) FROM ed_cargos c WHERE c."planPagoId" = p.id AND c.estado = 'pendiente')::int AS "cargosPendientes",
              (SELECT COALESCE(SUM(c.monto),0) FROM ed_cargos c WHERE c."planPagoId" = p.id AND c.estado = 'pendiente') AS "saldoPendiente"
       FROM ed_planes_pago p
       JOIN ed_estudiantes e ON e.id = p."estudianteId"
       LEFT JOIN ed_anios_escolares a ON a.id = p."anioEscolarId"
       WHERE ${conds.join(' AND ')}
       ORDER BY e.apellidos, e.nombres`,
      params,
    );
  }

  async upsertPlan(empresaId: number, dto: any) {
    const [existing] = await this.ds.query<any[]>(
      `SELECT id FROM ed_planes_pago
       WHERE "empresaId" = $1 AND "estudianteId" = $2 AND "anioEscolarId" = $3`,
      [empresaId, dto.estudianteId, dto.anioEscolarId],
    );
    if (existing) {
      const [row] = await this.ds.query<any[]>(
        `UPDATE ed_planes_pago
         SET "montoColegiatura" = $3, "montoMatricula" = $4, "diaCobro" = $5, descuento = $6
         WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
        [existing.id, empresaId,
         dto.montoColegiatura, dto.montoMatricula ?? 0, dto.diaCobro ?? 1, dto.descuento ?? 0],
      );
      return row;
    }
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_planes_pago (
         "empresaId","estudianteId","anioEscolarId","montoColegiatura","montoMatricula","diaCobro",descuento
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [empresaId, dto.estudianteId, dto.anioEscolarId,
       dto.montoColegiatura, dto.montoMatricula ?? 0, dto.diaCobro ?? 1, dto.descuento ?? 0],
    );
    return row;
  }

  // ── Generación de cargos ────────────────────────────────────────────────────

  async generarCargos(empresaId: number, planId: number, meses: number[], anio: number) {
    const [plan] = await this.ds.query<any[]>(
      `SELECT * FROM ed_planes_pago WHERE id = $1 AND "empresaId" = $2`,
      [planId, empresaId],
    );
    if (!plan) throw new NotFoundException('Plan de pago no encontrado');

    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    let created = 0;
    for (const mes of meses) {
      const [exists] = await this.ds.query<any[]>(
        `SELECT id FROM ed_cargos WHERE "planPagoId" = $1 AND mes = $2 AND anio = $3 AND tipo = 'colegiatura'`,
        [planId, mes, anio],
      );
      if (exists) continue;

      const monto = plan.montoColegiatura * (1 - (plan.descuento ?? 0) / 100);
      const vencimiento = `${anio}-${String(mes).padStart(2, '0')}-${String(plan.diaCobro ?? 5).padStart(2, '0')}`;
      await this.ds.query(
        `INSERT INTO ed_cargos (
           "empresaId","estudianteId","planPagoId",tipo,descripcion,monto,"fechaVencimiento",estado,mes,anio
         ) VALUES ($1,$2,$3,'colegiatura',$4,$5,$6,'pendiente',$7,$8)`,
        [empresaId, plan.estudianteId, planId,
         `Colegiatura ${MESES[mes - 1]} ${anio}`, monto, vencimiento, mes, anio],
      );
      created++;
    }
    return { created };
  }

  async generarMatricula(empresaId: number, planId: number, anio: number) {
    const [plan] = await this.ds.query<any[]>(
      `SELECT * FROM ed_planes_pago WHERE id = $1 AND "empresaId" = $2`,
      [planId, empresaId],
    );
    if (!plan) throw new NotFoundException('Plan de pago no encontrado');
    if (!plan.montoMatricula || plan.montoMatricula <= 0) {
      throw new BadRequestException('Este plan no tiene monto de matrícula configurado');
    }
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_cargos WHERE "planPagoId" = $1 AND tipo = 'matricula' AND anio = $2`,
      [planId, anio],
    );
    if (exists) throw new BadRequestException('Ya existe un cargo de matrícula para este año');
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_cargos (
         "empresaId","estudianteId","planPagoId",tipo,descripcion,monto,"fechaVencimiento",estado,anio
       ) VALUES ($1,$2,$3,'matricula',$4,$5,CURRENT_DATE,'pendiente',$6) RETURNING *`,
      [empresaId, plan.estudianteId, planId, `Matrícula ${anio}`, plan.montoMatricula, anio],
    );
    return row;
  }

  // ── Cargos ──────────────────────────────────────────────────────────────────

  async listCargos(empresaId: number, opts: {
    estudianteId?: number; estado?: string; mes?: number; anio?: number;
    planPagoId?: number; q?: string; vencidos?: boolean;
  } = {}) {
    const conds: string[] = [`c."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.estudianteId) { conds.push(`c."estudianteId" = $${idx}`); params.push(opts.estudianteId); idx++; }
    if (opts.planPagoId)   { conds.push(`c."planPagoId" = $${idx}`);   params.push(opts.planPagoId);   idx++; }
    if (opts.estado)       { conds.push(`c.estado = $${idx}`);         params.push(opts.estado);       idx++; }
    if (opts.mes)          { conds.push(`c.mes = $${idx}`);            params.push(opts.mes);          idx++; }
    if (opts.anio)         { conds.push(`c.anio = $${idx}`);           params.push(opts.anio);         idx++; }
    if (opts.vencidos)     { conds.push(`c."fechaVencimiento" < CURRENT_DATE AND c.estado = 'pendiente'`); }
    if (opts.q) {
      conds.push(`(e.nombres ILIKE $${idx} OR e.apellidos ILIKE $${idx} OR e.cedula ILIKE $${idx})`);
      params.push(`%${opts.q}%`); idx++;
    }
    return this.ds.query<any[]>(
      `SELECT c.*,
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              e.cedula AS "estudianteCedula"
       FROM ed_cargos c
       JOIN ed_estudiantes e ON e.id = c."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY c."fechaVencimiento", e.apellidos`,
      params,
    );
  }

  async addCargo(empresaId: number, dto: any) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [dto.estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_cargos (
         "empresaId","estudianteId","planPagoId",tipo,descripcion,monto,"fechaVencimiento",estado,mes,anio
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente',$8,$9) RETURNING *`,
      [empresaId, dto.estudianteId, dto.planPagoId ?? null,
       dto.tipo ?? 'otro', dto.descripcion, dto.monto,
       dto.fechaVencimiento ?? null, dto.mes ?? null, dto.anio ?? null],
    );
    return row;
  }

  async updateCargo(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_cargos WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Cargo no encontrado');
    const FIELDS = ['descripcion', 'monto', 'fechaVencimiento', 'estado'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return exists;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `UPDATE ed_cargos SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }

  // ── Pagos ───────────────────────────────────────────────────────────────────

  async listPagos(empresaId: number, opts: {
    estudianteId?: number; fechaInicio?: string; fechaFin?: string;
  } = {}) {
    const conds: string[] = [`p."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.estudianteId) { conds.push(`p."estudianteId" = $${idx}`); params.push(opts.estudianteId); idx++; }
    if (opts.fechaInicio)  { conds.push(`p.fecha >= $${idx}`);         params.push(opts.fechaInicio);  idx++; }
    if (opts.fechaFin)     { conds.push(`p.fecha <= $${idx}`);         params.push(opts.fechaFin);     idx++; }
    return this.ds.query<any[]>(
      `SELECT p.*,
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              c.descripcion AS "cargoDescripcion"
       FROM ed_pagos p
       JOIN ed_estudiantes e ON e.id = p."estudianteId"
       LEFT JOIN ed_cargos c ON c.id = p."cargoId"
       WHERE ${conds.join(' AND ')}
       ORDER BY p.fecha DESC, p."createdAt" DESC`,
      params,
    );
  }

  async registrarPago(empresaId: number, dto: any) {
    const [cargo] = await this.ds.query<any[]>(
      `SELECT c.*, e."empresaId" AS "estEmpresa"
       FROM ed_cargos c
       JOIN ed_estudiantes e ON e.id = c."estudianteId"
       WHERE c.id = $1 AND c."empresaId" = $2`,
      [dto.cargoId, empresaId],
    );
    if (!cargo) throw new NotFoundException('Cargo no encontrado');
    if (cargo.estado === 'pagado') throw new BadRequestException('Este cargo ya fue pagado');
    if (cargo.estado === 'anulado') throw new BadRequestException('No se puede pagar un cargo anulado');

    const [pago] = await this.ds.query<any[]>(
      `INSERT INTO ed_pagos (
         "empresaId","cargoId","estudianteId",monto,fecha,"metodoPago",referencia,observaciones
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [empresaId, cargo.id, cargo.estudianteId,
       dto.monto ?? cargo.monto,
       dto.fecha ?? new Date().toISOString().substring(0, 10),
       dto.metodoPago ?? 'efectivo',
       dto.referencia ?? null, dto.observaciones ?? null],
    );

    await this.ds.query(
      `UPDATE ed_cargos SET estado = 'pagado' WHERE id = $1`,
      [cargo.id],
    );

    return pago;
  }

  async resumenFinanciero(empresaId: number, anioEscolarId?: number) {
    const joinCond = anioEscolarId
      ? `JOIN ed_planes_pago pp ON pp.id = c."planPagoId" AND pp."anioEscolarId" = $2`
      : '';
    const params = anioEscolarId ? [empresaId, anioEscolarId] : [empresaId];

    const [res] = await this.ds.query<any[]>(
      `SELECT
         COALESCE(SUM(c.monto) FILTER (WHERE c.estado = 'pendiente'),0)::numeric AS pendiente,
         COALESCE(SUM(c.monto) FILTER (WHERE c.estado = 'pagado'),0)::numeric    AS cobrado,
         COALESCE(SUM(c.monto) FILTER (WHERE c.estado = 'vencido' OR (c.estado = 'pendiente' AND c."fechaVencimiento" < CURRENT_DATE)),0)::numeric AS vencido,
         COUNT(*) FILTER (WHERE c.estado = 'pendiente')::int AS cargosPendientes,
         COUNT(DISTINCT c."estudianteId") FILTER (WHERE c.estado = 'pendiente' AND c."fechaVencimiento" < CURRENT_DATE)::int AS morosos
       FROM ed_cargos c
       ${joinCond}
       WHERE c."empresaId" = $1`,
      params,
    );

    const cobradoMes = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM(p.monto),0)::numeric AS total
       FROM ed_pagos p
       WHERE p."empresaId" = $1
         AND DATE_TRUNC('month', p.fecha) = DATE_TRUNC('month', CURRENT_DATE)`,
      [empresaId],
    );

    return { ...res, cobradoMes: cobradoMes[0]?.total ?? 0 };
  }
}
