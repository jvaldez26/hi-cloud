import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class ServiciosProService {
  private readonly logger = new Logger(ServiciosProService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private get empresaId() {
    return this.tenantSvc.getEmpresaId();
  }

  // Redondear a cuartos de hora
  private redondearHoras(h: number): number {
    return Math.round(h * 4) / 4;
  }

  private async siguienteNumero(tabla: string, prefijo: string): Promise<string> {
    const rows = await this.ds.query<{ n: string }[]>(
      `SELECT COALESCE(MAX(id), 0) + 1 AS n FROM ${tabla} WHERE "empresaId" = $1`,
      [this.empresaId],
    );
    return `${prefijo}-${String(rows[0]?.n ?? 1).padStart(3, '0')}`;
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────────

  async getDashboard() {
    const eid = this.empresaId;
    const [expActivos, horasMes, pendCobrar, tareasVencidas, tiempoSinFacturar, topExpedientes, retainersPorFacturar] =
      await Promise.all([
        this.ds.query<{ total: string }[]>(
          `SELECT COUNT(*) AS total FROM sp_expedientes WHERE "empresaId"=$1 AND estado='activo' AND "isActive"=true`,
          [eid],
        ),
        this.ds.query<{ total: string }[]>(
          `SELECT COALESCE(SUM(horas),0) AS total FROM sp_tiempo
           WHERE "empresaId"=$1 AND fecha >= date_trunc('month', CURRENT_DATE)`,
          [eid],
        ),
        this.ds.query<{ total: string }[]>(
          `SELECT COUNT(*) AS total FROM sp_facturas_honorarios WHERE "empresaId"=$1 AND estado IN ('borrador','enviada')`,
          [eid],
        ),
        this.ds.query<{ total: string }[]>(
          `SELECT COUNT(*) AS total FROM sp_tareas
           WHERE "empresaId"=$1 AND estado NOT IN ('completada','cancelada')
           AND "fechaVencimiento" <= CURRENT_DATE`,
          [eid],
        ),
        this.ds.query<{ total: string; monto: string }[]>(
          `SELECT COALESCE(SUM(horas),0) AS total, COALESCE(SUM(monto),0) AS monto
           FROM sp_tiempo WHERE "empresaId"=$1 AND facturado=false AND facturable=true`,
          [eid],
        ),
        this.ds.query<any[]>(
          `SELECT e.id, e.numero, e.nombre, COALESCE(SUM(t.horas),0) AS horas
           FROM sp_expedientes e
           LEFT JOIN sp_tiempo t ON t."expedienteId"=e.id AND t.fecha >= date_trunc('month', CURRENT_DATE)
           WHERE e."empresaId"=$1 AND e.estado='activo'
           GROUP BY e.id, e.numero, e.nombre
           ORDER BY horas DESC LIMIT 5`,
          [eid],
        ),
        this.ds.query<any[]>(
          `SELECT r.id, r."montoMensual", e.nombre AS expedienteNombre, c.nombre AS clienteNombre
           FROM sp_retainers r
           JOIN sp_expedientes e ON e.id=r."expedienteId"
           JOIN clientes c ON c.id=r."clienteId"
           WHERE r."empresaId"=$1 AND r."isActive"=true
           AND NOT EXISTS (
             SELECT 1 FROM sp_retainer_pagos p
             WHERE p."retainerId"=r.id AND p.periodo = TO_CHAR(CURRENT_DATE,'YYYY-MM')
           )`,
          [eid],
        ),
      ]);

    return {
      expedientesActivos: Number(expActivos[0]?.total ?? 0),
      horasMes: Number(horasMes[0]?.total ?? 0),
      facturasPendientesCobrar: Number(pendCobrar[0]?.total ?? 0),
      tareasVencidas: Number(tareasVencidas[0]?.total ?? 0),
      tiempoSinFacturarHoras: Number(tiempoSinFacturar[0]?.total ?? 0),
      tiempoSinFacturarMonto: Number(tiempoSinFacturar[0]?.monto ?? 0),
      topExpedientes,
      retainersPorFacturar,
    };
  }

  // ── PROFESIONALES ────────────────────────────────────────────────────────────

  async getProfesionales() {
    return this.ds.query<any[]>(
      `SELECT p.*, e.nombre AS empleadoNombre
       FROM sp_profesionales p
       LEFT JOIN empleados e ON e.id=p."empleadoId"
       WHERE p."empresaId"=$1 AND p."isActive"=true
       ORDER BY p.nombre`,
      [this.empresaId],
    );
  }

  async crearProfesional(data: any) {
    const eid = this.empresaId;
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_profesionales
         ("empresaId", nombre, apellidos, titulo, especialidad, colegiatura,
          email, telefono, "tarifaHora", "tarifaDia", moneda, "horasSemanales",
          "empleadoId", "usuarioId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [eid, data.nombre, data.apellidos, data.titulo, data.especialidad,
       data.colegiatura, data.email, data.telefono, data.tarifaHora,
       data.tarifaDia, data.moneda ?? 'DOP', data.horasSemanales ?? 40,
       data.empleadoId ?? null, data.usuarioId ?? null],
    );
    return rows[0];
  }

  async actualizarProfesional(id: number, data: any) {
    const eid = this.empresaId;
    const campos: string[] = [];
    const vals: any[] = [id, eid];
    const set = (col: string, val: any) => {
      vals.push(val);
      campos.push(`"${col}"=$${vals.length}`);
    };
    if (data.nombre     !== undefined) set('nombre',     data.nombre);
    if (data.apellidos  !== undefined) set('apellidos',  data.apellidos);
    if (data.titulo     !== undefined) set('titulo',     data.titulo);
    if (data.especialidad !== undefined) set('especialidad', data.especialidad);
    if (data.colegiatura !== undefined) set('colegiatura', data.colegiatura);
    if (data.email      !== undefined) set('email',      data.email);
    if (data.telefono   !== undefined) set('telefono',   data.telefono);
    if (data.tarifaHora !== undefined) set('tarifaHora', data.tarifaHora);
    if (data.tarifaDia  !== undefined) set('tarifaDia',  data.tarifaDia);
    if (data.horasSemanales !== undefined) set('horasSemanales', data.horasSemanales);
    if (data.isActive   !== undefined) set('isActive',   data.isActive);
    if (!campos.length) throw new Error('No hay campos para actualizar');
    const rows = await this.ds.query(
      `UPDATE sp_profesionales SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  async getProfesionalTiempo(id: number, query: any) {
    const eid = this.empresaId;
    const conds = [`t."empresaId"=$1`, `t."profesionalId"=$2`];
    const vals: any[] = [eid, id];
    if (query.desde) { vals.push(query.desde); conds.push(`t.fecha >= $${vals.length}`); }
    if (query.hasta) { vals.push(query.hasta); conds.push(`t.fecha <= $${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT t.*, e.nombre AS expedienteNombre, e.numero AS expedienteNumero
       FROM sp_tiempo t
       JOIN sp_expedientes e ON e.id=t."expedienteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY t.fecha DESC LIMIT 200`,
      vals,
    );
  }

  async getProfesionalCarga(id: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM(horas),0) AS horasSemana
       FROM sp_tiempo
       WHERE "empresaId"=$1 AND "profesionalId"=$2
       AND fecha >= date_trunc('week', CURRENT_DATE)`,
      [this.empresaId, id],
    );
    const prof = await this.ds.query<any[]>(
      `SELECT "horasSemanales" FROM sp_profesionales WHERE id=$1 AND "empresaId"=$2`,
      [id, this.empresaId],
    );
    const horasSemana = Number(rows[0]?.horasSemana ?? 0);
    const capacidad = Number(prof[0]?.horasSemanales ?? 40);
    return { horasSemana, capacidad, utilizacion: capacidad ? (horasSemana / capacidad) * 100 : 0 };
  }

  // ── EXPEDIENTES ──────────────────────────────────────────────────────────────

  async getExpedientes(query: any) {
    const eid = this.empresaId;
    const conds = [`e."empresaId"=$1`, `e."isActive"=true`];
    const vals: any[] = [eid];
    if (query.estado)    { vals.push(query.estado);    conds.push(`e.estado=$${vals.length}`); }
    if (query.clienteId) { vals.push(Number(query.clienteId)); conds.push(`e."clienteId"=$${vals.length}`); }
    if (query.search)    { vals.push(`%${query.search}%`); conds.push(`(e.nombre ILIKE $${vals.length} OR e.numero ILIKE $${vals.length})`); }
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const offset = Number(query.offset ?? 0);
    return this.ds.query<any[]>(
      `SELECT e.*, c.nombre AS clienteNombre,
              p.nombre AS profesionalNombre, p.apellidos AS profesionalApellidos
       FROM sp_expedientes e
       JOIN clientes c ON c.id=e."clienteId"
       LEFT JOIN sp_profesionales p ON p.id=e."profesionalId"
       WHERE ${conds.join(' AND ')}
       ORDER BY e."createdAt" DESC
       LIMIT ${limit} OFFSET ${offset}`,
      vals,
    );
  }

  async crearExpediente(data: any) {
    const eid = this.empresaId;
    const numero = await this.siguienteNumero('sp_expedientes', 'EXP');
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_expedientes
         ("empresaId", numero, tipo, nombre, descripcion, "clienteId", "clienteContacto",
          "profesionalId", "fechaInicio", "fechaEstimadaFin", "tipoFacturacion",
          "presupuestoTotal", "tarifaHoraProyecto", moneda, "retainerMensual",
          "horasIncluidasRetainer", estado, prioridad, "requiereAprobacionHoras", notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [eid, numero, data.tipo, data.nombre, data.descripcion, data.clienteId,
       data.clienteContacto, data.profesionalId ?? null, data.fechaInicio,
       data.fechaEstimadaFin ?? null, data.tipoFacturacion, data.presupuestoTotal ?? null,
       data.tarifaHoraProyecto ?? null, data.moneda ?? 'DOP', data.retainerMensual ?? null,
       data.horasIncluidasRetainer ?? null, data.estado ?? 'activo', data.prioridad ?? 'normal',
       data.requiereAprobacionHoras ?? false, data.notas ?? null],
    );
    return rows[0];
  }

  async getExpediente(id: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT e.*, c.nombre AS clienteNombre, c.rnc AS clienteRnc,
              c.direccion AS clienteDireccion, c.telefono AS clienteTelefono,
              p.nombre AS profesionalNombre, p.apellidos AS profesionalApellidos,
              p."tarifaHora" AS profesionalTarifa
       FROM sp_expedientes e
       JOIN clientes c ON c.id=e."clienteId"
       LEFT JOIN sp_profesionales p ON p.id=e."profesionalId"
       WHERE e.id=$1 AND e."empresaId"=$2`,
      [id, this.empresaId],
    );
    if (!rows.length) throw new NotFoundException('Expediente no encontrado');
    return rows[0];
  }

  async actualizarExpediente(id: number, data: any) {
    const eid = this.empresaId;
    const campos: string[] = [`"updatedAt"=NOW()`];
    const vals: any[] = [id, eid];
    const set = (col: string, val: any) => { vals.push(val); campos.push(`"${col}"=$${vals.length}`); };
    if (data.nombre           !== undefined) set('nombre',           data.nombre);
    if (data.descripcion      !== undefined) set('descripcion',      data.descripcion);
    if (data.tipo             !== undefined) set('tipo',             data.tipo);
    if (data.profesionalId    !== undefined) set('profesionalId',    data.profesionalId);
    if (data.fechaEstimadaFin !== undefined) set('fechaEstimadaFin', data.fechaEstimadaFin);
    if (data.fechaFinReal     !== undefined) set('fechaFinReal',     data.fechaFinReal);
    if (data.tipoFacturacion  !== undefined) set('tipoFacturacion',  data.tipoFacturacion);
    if (data.presupuestoTotal !== undefined) set('presupuestoTotal', data.presupuestoTotal);
    if (data.tarifaHoraProyecto !== undefined) set('tarifaHoraProyecto', data.tarifaHoraProyecto);
    if (data.retainerMensual  !== undefined) set('retainerMensual',  data.retainerMensual);
    if (data.estado           !== undefined) set('estado',           data.estado);
    if (data.prioridad        !== undefined) set('prioridad',        data.prioridad);
    if (data.notas            !== undefined) set('notas',            data.notas);
    const rows = await this.ds.query(
      `UPDATE sp_expedientes SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  async getExpedienteResumen(id: number) {
    const eid = this.empresaId;
    const exp = await this.getExpediente(id);
    const [tiempo, gastos, facturas, tareasPend] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT COALESCE(SUM(horas),0) AS totalHoras, COALESCE(SUM(monto),0) AS totalMonto,
                COALESCE(SUM(CASE WHEN facturado=false AND facturable=true THEN horas ELSE 0 END),0) AS horasSinFacturar
         FROM sp_tiempo WHERE "expedienteId"=$1 AND "empresaId"=$2`,
        [id, eid],
      ),
      this.ds.query<any[]>(
        `SELECT COALESCE(SUM(monto),0) AS total,
                COALESCE(SUM(CASE WHEN reembolsado=false AND reembolsable=true THEN monto ELSE 0 END),0) AS pendiente
         FROM sp_gastos_expediente WHERE "expedienteId"=$1 AND "empresaId"=$2`,
        [id, eid],
      ),
      this.ds.query<any[]>(
        `SELECT COALESCE(SUM(total),0) AS totalFacturado,
                COALESCE(SUM(CASE WHEN estado='pagada' THEN total ELSE 0 END),0) AS totalCobrado
         FROM sp_facturas_honorarios WHERE "expedienteId"=$1 AND "empresaId"=$2`,
        [id, eid],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM sp_tareas
         WHERE "expedienteId"=$1 AND estado NOT IN ('completada','cancelada')`,
        [id],
      ),
    ]);
    return {
      expediente: exp,
      totalHoras:        Number(tiempo[0]?.totalHoras ?? 0),
      totalMontoTiempo:  Number(tiempo[0]?.totalMonto ?? 0),
      horasSinFacturar:  Number(tiempo[0]?.horasSinFacturar ?? 0),
      totalGastos:       Number(gastos[0]?.total ?? 0),
      gastosPendientes:  Number(gastos[0]?.pendiente ?? 0),
      totalFacturado:    Number(facturas[0]?.totalFacturado ?? 0),
      totalCobrado:      Number(facturas[0]?.totalCobrado ?? 0),
      tareasPendientes:  Number(tareasPend[0]?.total ?? 0),
    };
  }

  async getExpedienteTiempo(id: number, query: any) {
    const conds = [`t."expedienteId"=$1`, `t."empresaId"=$2`];
    const vals: any[] = [id, this.empresaId];
    if (query.profesionalId) { vals.push(Number(query.profesionalId)); conds.push(`t."profesionalId"=$${vals.length}`); }
    if (query.desde)         { vals.push(query.desde); conds.push(`t.fecha>=$${vals.length}`); }
    if (query.hasta)         { vals.push(query.hasta); conds.push(`t.fecha<=$${vals.length}`); }
    if (query.facturado !== undefined) { vals.push(query.facturado === 'true'); conds.push(`t.facturado=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT t.*, p.nombre AS profesionalNombre, p.apellidos AS profesionalApellidos
       FROM sp_tiempo t
       JOIN sp_profesionales p ON p.id=t."profesionalId"
       WHERE ${conds.join(' AND ')}
       ORDER BY t.fecha DESC, t."createdAt" DESC`,
      vals,
    );
  }

  async getExpedienteTareas(id: number) {
    return this.ds.query<any[]>(
      `SELECT t.*, p.nombre AS profesionalNombre, p.apellidos AS profesionalApellidos
       FROM sp_tareas t
       LEFT JOIN sp_profesionales p ON p.id=t."profesionalId"
       WHERE t."expedienteId"=$1 AND t."empresaId"=$2
       ORDER BY t.orden, t."createdAt"`,
      [id, this.empresaId],
    );
  }

  async getExpedienteGastos(id: number) {
    return this.ds.query<any[]>(
      `SELECT g.*, p.nombre AS profesionalNombre
       FROM sp_gastos_expediente g
       LEFT JOIN sp_profesionales p ON p.id=g."profesionalId"
       WHERE g."expedienteId"=$1 AND g."empresaId"=$2
       ORDER BY g.fecha DESC`,
      [id, this.empresaId],
    );
  }

  async getExpedienteDocumentos(id: number) {
    return this.ds.query<any[]>(
      `SELECT d.*, u.nombre AS subidoPorNombre
       FROM sp_documentos d
       LEFT JOIN users u ON u.id=d."subidoPor"
       WHERE d."expedienteId"=$1 AND d."empresaId"=$2 AND d."isActive"=true
       ORDER BY d."subidoAt" DESC`,
      [id, this.empresaId],
    );
  }

  async getExpedienteReuniones(id: number) {
    return this.ds.query<any[]>(
      `SELECT r.*, p.nombre AS profesionalNombre
       FROM sp_reuniones r
       LEFT JOIN sp_profesionales p ON p.id=r."profesionalId"
       WHERE r."expedienteId"=$1 AND r."empresaId"=$2
       ORDER BY r.fecha DESC`,
      [id, this.empresaId],
    );
  }

  // ── TAREAS ───────────────────────────────────────────────────────────────────

  async getTareas(query: any) {
    const eid = this.empresaId;
    const conds = [`t."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.expedienteId) { vals.push(Number(query.expedienteId)); conds.push(`t."expedienteId"=$${vals.length}`); }
    if (query.profesionalId) { vals.push(Number(query.profesionalId)); conds.push(`t."profesionalId"=$${vals.length}`); }
    if (query.estado) { vals.push(query.estado); conds.push(`t.estado=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT t.*, e.nombre AS expedienteNombre, e.numero AS expedienteNumero,
              p.nombre AS profesionalNombre, p.apellidos AS profesionalApellidos
       FROM sp_tareas t
       JOIN sp_expedientes e ON e.id=t."expedienteId"
       LEFT JOIN sp_profesionales p ON p.id=t."profesionalId"
       WHERE ${conds.join(' AND ')}
       ORDER BY t.prioridad DESC, t."fechaVencimiento" NULLS LAST, t.orden`,
      vals,
    );
  }

  async crearTarea(data: any) {
    const eid = this.empresaId;
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_tareas
         ("empresaId", "expedienteId", titulo, descripcion, categoria, "profesionalId",
          "fechaInicio", "fechaVencimiento", "horasEstimadas", estado, prioridad, facturable, orden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [eid, data.expedienteId, data.titulo, data.descripcion ?? null, data.categoria ?? null,
       data.profesionalId ?? null, data.fechaInicio ?? null, data.fechaVencimiento ?? null,
       data.horasEstimadas ?? null, data.estado ?? 'pendiente', data.prioridad ?? 'normal',
       data.facturable !== false, data.orden ?? 0],
    );
    return rows[0];
  }

  async actualizarTarea(id: number, data: any) {
    const eid = this.empresaId;
    const campos: string[] = [`"updatedAt"=NOW()`];
    const vals: any[] = [id, eid];
    const set = (col: string, val: any) => { vals.push(val); campos.push(`"${col}"=$${vals.length}`); };
    if (data.titulo          !== undefined) set('titulo',          data.titulo);
    if (data.descripcion     !== undefined) set('descripcion',     data.descripcion);
    if (data.categoria       !== undefined) set('categoria',       data.categoria);
    if (data.profesionalId   !== undefined) set('profesionalId',   data.profesionalId);
    if (data.fechaVencimiento !== undefined) set('fechaVencimiento', data.fechaVencimiento);
    if (data.horasEstimadas  !== undefined) set('horasEstimadas',  data.horasEstimadas);
    if (data.horasReales     !== undefined) set('horasReales',     data.horasReales);
    if (data.estado          !== undefined) {
      set('estado', data.estado);
      if (data.estado === 'completada') { campos.push(`"fechaCompletado"=NOW()`); }
    }
    if (data.prioridad       !== undefined) set('prioridad',       data.prioridad);
    if (data.facturable      !== undefined) set('facturable',      data.facturable);
    if (data.orden           !== undefined) set('orden',           data.orden);
    const rows = await this.ds.query(
      `UPDATE sp_tareas SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  async eliminarTarea(id: number) {
    await this.ds.query(
      `DELETE FROM sp_tareas WHERE id=$1 AND "empresaId"=$2`,
      [id, this.empresaId],
    );
    return { success: true };
  }

  // ── TIME TRACKING ────────────────────────────────────────────────────────────

  async getTiempo(query: any) {
    const eid = this.empresaId;
    const conds = [`t."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.expedienteId)  { vals.push(Number(query.expedienteId));  conds.push(`t."expedienteId"=$${vals.length}`); }
    if (query.profesionalId) { vals.push(Number(query.profesionalId)); conds.push(`t."profesionalId"=$${vals.length}`); }
    if (query.desde)         { vals.push(query.desde); conds.push(`t.fecha>=$${vals.length}`); }
    if (query.hasta)         { vals.push(query.hasta); conds.push(`t.fecha<=$${vals.length}`); }
    if (query.facturado !== undefined) { vals.push(query.facturado === 'true'); conds.push(`t.facturado=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT t.*,
              e.nombre AS expedienteNombre, e.numero AS expedienteNumero,
              p.nombre AS profesionalNombre, p.apellidos AS profesionalApellidos
       FROM sp_tiempo t
       JOIN sp_expedientes e ON e.id=t."expedienteId"
       JOIN sp_profesionales p ON p.id=t."profesionalId"
       WHERE ${conds.join(' AND ')}
       ORDER BY t.fecha DESC, t."createdAt" DESC
       LIMIT 500`,
      vals,
    );
  }

  async crearTiempo(data: any) {
    const eid = this.empresaId;
    const horas = this.redondearHoras(Number(data.horas));
    // Calcular tarifa y monto si no vienen
    let tarifaHora = data.tarifaHora ?? null;
    let monto = data.monto ?? null;
    if (!tarifaHora && data.profesionalId) {
      const p = await this.ds.query<any[]>(
        `SELECT "tarifaHora" FROM sp_profesionales WHERE id=$1 AND "empresaId"=$2`,
        [data.profesionalId, eid],
      );
      tarifaHora = p[0]?.tarifaHora ?? null;
    }
    if (!tarifaHora && data.expedienteId) {
      const e = await this.ds.query<any[]>(
        `SELECT "tarifaHoraProyecto" FROM sp_expedientes WHERE id=$1 AND "empresaId"=$2`,
        [data.expedienteId, eid],
      );
      tarifaHora = e[0]?.tarifaHoraProyecto ?? null;
    }
    if (tarifaHora) monto = horas * Number(tarifaHora);
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_tiempo
         ("empresaId","expedienteId","tareaId","profesionalId",fecha,"horaInicio","horaFin",
          horas,descripcion,categoria,facturable,"tarifaHora",monto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [eid, data.expedienteId, data.tareaId ?? null, data.profesionalId,
       data.fecha, data.horaInicio ?? null, data.horaFin ?? null,
       horas, data.descripcion, data.categoria ?? null,
       data.facturable !== false, tarifaHora, monto],
    );
    // Actualizar totales del expediente
    await this.ds.query(
      `UPDATE sp_expedientes SET "totalHorasRegistradas" = (
         SELECT COALESCE(SUM(horas),0) FROM sp_tiempo
         WHERE "expedienteId"=$1 AND "empresaId"=$2
       ), "updatedAt"=NOW()
       WHERE id=$1 AND "empresaId"=$2`,
      [data.expedienteId, eid],
    );
    return rows[0];
  }

  async actualizarTiempo(id: number, data: any) {
    const eid = this.empresaId;
    const campos: string[] = [];
    const vals: any[] = [id, eid];
    const set = (col: string, val: any) => { vals.push(val); campos.push(`"${col}"=$${vals.length}`); };
    if (data.fecha       !== undefined) set('fecha',       data.fecha);
    if (data.horas       !== undefined) { vals.push(this.redondearHoras(Number(data.horas))); campos.push(`horas=$${vals.length}`); }
    if (data.descripcion !== undefined) set('descripcion', data.descripcion);
    if (data.categoria   !== undefined) set('categoria',   data.categoria);
    if (data.facturable  !== undefined) set('facturable',  data.facturable);
    if (data.tarifaHora  !== undefined) set('tarifaHora',  data.tarifaHora);
    if (data.monto       !== undefined) set('monto',       data.monto);
    if (data.aprobado    !== undefined) set('aprobado',    data.aprobado);
    if (!campos.length) throw new Error('No hay campos para actualizar');
    const rows = await this.ds.query(
      `UPDATE sp_tiempo SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  async eliminarTiempo(id: number) {
    await this.ds.query(`DELETE FROM sp_tiempo WHERE id=$1 AND "empresaId"=$2`, [id, this.empresaId]);
    return { success: true };
  }

  // ── TIMER en Redis ───────────────────────────────────────────────────────────

  private timerKey(profesionalId: number) {
    return `sp_timer:${this.empresaId}:${profesionalId}`;
  }

  async iniciarTimer(body: any) {
    const key = this.timerKey(body.profesionalId);
    const existing = await this.cache.get(key);
    if (existing) throw new Error('Ya hay un timer activo para este profesional');
    const payload = {
      inicio: new Date().toISOString(),
      expedienteId: body.expedienteId,
      tareaId: body.tareaId ?? null,
      descripcion: body.descripcion ?? '',
      profesionalId: body.profesionalId,
    };
    await this.cache.set(key, JSON.stringify(payload), 86400 * 1000);
    return { activo: true, ...payload };
  }

  async detenerTimer(body: any) {
    const key = this.timerKey(body.profesionalId);
    const raw = await this.cache.get<string>(key);
    if (!raw) throw new Error('No hay timer activo para este profesional');
    const timerData = JSON.parse(raw as string);
    const horas = this.redondearHoras((Date.now() - new Date(timerData.inicio).getTime()) / 3_600_000);
    await this.cache.del(key);
    return this.crearTiempo({
      expedienteId: timerData.expedienteId,
      tareaId:      timerData.tareaId,
      profesionalId: timerData.profesionalId,
      fecha:        fechaHoyRD(),
      horas,
      descripcion:  body.descripcion ?? timerData.descripcion ?? 'Tiempo registrado vía timer',
      facturable:   true,
    });
  }

  async getTimerActivo(profesionalId: number) {
    const key = this.timerKey(profesionalId);
    const raw = await this.cache.get<string>(key);
    if (!raw) return { activo: false };
    const data = JSON.parse(raw as string);
    const transcurridoMs = Date.now() - new Date(data.inicio).getTime();
    return { activo: true, ...data, transcurridoMs };
  }

  // ── GASTOS ───────────────────────────────────────────────────────────────────

  async getGastos(query: any) {
    const eid = this.empresaId;
    const conds = [`g."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.expedienteId) { vals.push(Number(query.expedienteId)); conds.push(`g."expedienteId"=$${vals.length}`); }
    if (query.reembolsado !== undefined) { vals.push(query.reembolsado === 'true'); conds.push(`g.reembolsado=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT g.*, e.nombre AS expedienteNombre, e.numero AS expedienteNumero,
              p.nombre AS profesionalNombre
       FROM sp_gastos_expediente g
       JOIN sp_expedientes e ON e.id=g."expedienteId"
       LEFT JOIN sp_profesionales p ON p.id=g."profesionalId"
       WHERE ${conds.join(' AND ')}
       ORDER BY g.fecha DESC LIMIT 500`,
      vals,
    );
  }

  async crearGasto(data: any) {
    const eid = this.empresaId;
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_gastos_expediente
         ("empresaId","expedienteId","profesionalId",fecha,descripcion,categoria,monto,comprobante,reembolsable,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [eid, data.expedienteId, data.profesionalId ?? null, data.fecha, data.descripcion,
       data.categoria ?? null, data.monto, data.comprobante ?? null,
       data.reembolsable !== false, data.notas ?? null],
    );
    return rows[0];
  }

  async actualizarGasto(id: number, data: any) {
    const campos: string[] = [];
    const vals: any[] = [id, this.empresaId];
    const set = (col: string, val: any) => { vals.push(val); campos.push(`"${col}"=$${vals.length}`); };
    if (data.fecha        !== undefined) set('fecha',        data.fecha);
    if (data.descripcion  !== undefined) set('descripcion',  data.descripcion);
    if (data.categoria    !== undefined) set('categoria',    data.categoria);
    if (data.monto        !== undefined) set('monto',        data.monto);
    if (data.comprobante  !== undefined) set('comprobante',  data.comprobante);
    if (data.reembolsable !== undefined) set('reembolsable', data.reembolsable);
    if (data.reembolsado  !== undefined) set('reembolsado',  data.reembolsado);
    if (!campos.length) throw new Error('No hay campos para actualizar');
    const rows = await this.ds.query(
      `UPDATE sp_gastos_expediente SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  // ── CONTRATOS ────────────────────────────────────────────────────────────────

  async getContratos(query: any) {
    const eid = this.empresaId;
    const conds = [`c."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.expedienteId) { vals.push(Number(query.expedienteId)); conds.push(`c."expedienteId"=$${vals.length}`); }
    if (query.estado)       { vals.push(query.estado); conds.push(`c.estado=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT c.*, cl.nombre AS clienteNombre, e.nombre AS expedienteNombre
       FROM sp_contratos c
       JOIN clientes cl ON cl.id=c."clienteId"
       LEFT JOIN sp_expedientes e ON e.id=c."expedienteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY c."createdAt" DESC`,
      vals,
    );
  }

  async crearContrato(data: any) {
    const eid = this.empresaId;
    let clienteId = data.clienteId;
    if (!clienteId && data.expedienteId) {
      const exp = await this.ds.query<any[]>(`SELECT "clienteId" FROM sp_expedientes WHERE id=$1 AND "empresaId"=$2`, [data.expedienteId, eid]);
      clienteId = exp[0]?.clienteId;
    }
    const numero = await this.siguienteNumero('sp_contratos', 'CON');
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_contratos
         ("empresaId",numero,"expedienteId","clienteId","profesionalId",titulo,tipo,contenido,
          "fechaInicio","fechaVencimiento",valor,moneda,estado,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [eid, numero, data.expedienteId ?? null, clienteId, data.profesionalId ?? null, data.titulo,
       data.tipo ?? null, data.contenido ?? null, data.fechaInicio,
       data.fechaVencimiento ?? null, data.valor ?? null,
       data.moneda ?? 'DOP', data.estado ?? 'borrador', data.notas ?? null],
    );
    return rows[0];
  }

  async getContrato(id: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT c.*, cl.nombre AS clienteNombre, cl.rnc AS clienteRnc,
              e.nombre AS expedienteNombre
       FROM sp_contratos c
       JOIN clientes cl ON cl.id=c."clienteId"
       LEFT JOIN sp_expedientes e ON e.id=c."expedienteId"
       WHERE c.id=$1 AND c."empresaId"=$2`,
      [id, this.empresaId],
    );
    if (!rows.length) throw new NotFoundException('Contrato no encontrado');
    return rows[0];
  }

  async actualizarContrato(id: number, data: any) {
    const campos: string[] = [];
    const vals: any[] = [id, this.empresaId];
    const set = (col: string, val: any) => { vals.push(val); campos.push(`"${col}"=$${vals.length}`); };
    if (data.titulo            !== undefined) set('titulo',            data.titulo);
    if (data.tipo              !== undefined) set('tipo',              data.tipo);
    if (data.contenido         !== undefined) set('contenido',         data.contenido);
    if (data.estado            !== undefined) set('estado',            data.estado);
    if (data.fechaVencimiento  !== undefined) set('fechaVencimiento',  data.fechaVencimiento);
    if (data.valor             !== undefined) set('valor',             data.valor);
    if (data.firmadoPor        !== undefined) set('firmadoPor',        data.firmadoPor);
    if (data.fechaFirmaCliente !== undefined) set('fechaFirmaCliente', data.fechaFirmaCliente);
    if (data.notas             !== undefined) set('notas',             data.notas);
    if (!campos.length) throw new Error('No hay campos para actualizar');
    const rows = await this.ds.query(
      `UPDATE sp_contratos SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  // ── DOCUMENTOS ───────────────────────────────────────────────────────────────

  async crearDocumento(data: any) {
    const eid = this.empresaId;
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_documentos
         ("empresaId","expedienteId",nombre,descripcion,tipo,url,"tamanioBytes","subidoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [eid, data.expedienteId, data.nombre, data.descripcion ?? null,
       data.tipo ?? null, data.url ?? null, data.tamanioBytes ?? null,
       data.subidoPor ?? null],
    );
    return rows[0];
  }

  async eliminarDocumento(id: number) {
    await this.ds.query(
      `UPDATE sp_documentos SET "isActive"=false WHERE id=$1 AND "empresaId"=$2`,
      [id, this.empresaId],
    );
    return { success: true };
  }

  // ── REUNIONES ────────────────────────────────────────────────────────────────

  async getReuniones(query: any) {
    const eid = this.empresaId;
    const conds = [`r."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.expedienteId)  { vals.push(Number(query.expedienteId));  conds.push(`r."expedienteId"=$${vals.length}`); }
    if (query.profesionalId) { vals.push(Number(query.profesionalId)); conds.push(`r."profesionalId"=$${vals.length}`); }
    if (query.desde)         { vals.push(query.desde); conds.push(`r.fecha>=$${vals.length}`); }
    if (query.hasta)         { vals.push(query.hasta); conds.push(`r.fecha<=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT r.*, e.nombre AS expedienteNombre, e.numero AS expedienteNumero,
              p.nombre AS profesionalNombre
       FROM sp_reuniones r
       LEFT JOIN sp_expedientes e ON e.id=r."expedienteId"
       LEFT JOIN sp_profesionales p ON p.id=r."profesionalId"
       WHERE ${conds.join(' AND ')}
       ORDER BY r.fecha DESC LIMIT 200`,
      vals,
    );
  }

  async crearReunion(data: any) {
    const eid = this.empresaId;
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_reuniones
         ("empresaId","expedienteId",titulo,tipo,fecha,"duracionMinutos",
          lugar,"enlaceVirtual","profesionalId","participantesExternos")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [eid, data.expedienteId ?? null, data.titulo, data.tipo ?? null,
       data.fecha, data.duracionMinutos ?? 60, data.lugar ?? null,
       data.enlaceVirtual ?? null, data.profesionalId ?? null,
       data.participantesExternos ?? null],
    );
    return rows[0];
  }

  async actualizarReunion(id: number, data: any) {
    const campos: string[] = [];
    const vals: any[] = [id, this.empresaId];
    const set = (col: string, val: any) => { vals.push(val); campos.push(`"${col}"=$${vals.length}`); };
    if (data.titulo                 !== undefined) set('titulo',                data.titulo);
    if (data.fecha                  !== undefined) set('fecha',                 data.fecha);
    if (data.duracionMinutos        !== undefined) set('duracionMinutos',       data.duracionMinutos);
    if (data.lugar                  !== undefined) set('lugar',                 data.lugar);
    if (data.enlaceVirtual          !== undefined) set('enlaceVirtual',         data.enlaceVirtual);
    if (data.estado                 !== undefined) set('estado',                data.estado);
    if (data.acuerdos               !== undefined) set('acuerdos',              data.acuerdos);
    if (data.proximosPasos          !== undefined) set('proximosPasos',         data.proximosPasos);
    if (data.horasRegistradas       !== undefined) set('horasRegistradas',      data.horasRegistradas);
    if (!campos.length) throw new Error('No hay campos para actualizar');
    const rows = await this.ds.query(
      `UPDATE sp_reuniones SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  // ── HONORARIOS ───────────────────────────────────────────────────────────────

  async getHonorarios(query: any) {
    const eid = this.empresaId;
    const conds = [`h."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.expedienteId) { vals.push(Number(query.expedienteId)); conds.push(`h."expedienteId"=$${vals.length}`); }
    if (query.estado)       { vals.push(query.estado); conds.push(`h.estado=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT h.*, e.nombre AS expedienteNombre, c.nombre AS clienteNombre
       FROM sp_facturas_honorarios h
       JOIN sp_expedientes e ON e.id=h."expedienteId"
       JOIN clientes c ON c.id=h."clienteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY h."createdAt" DESC`,
      vals,
    );
  }

  async generarHonorarios(body: any) {
    const eid = this.empresaId;
    const exp = await this.getExpediente(body.expedienteId);
    const desde = body.desde;
    const hasta = body.hasta ?? fechaHoyRD();

    // Tiempo no facturado
    const tiempos = await this.ds.query<any[]>(
      `SELECT t.*, p.nombre AS profesionalNombre
       FROM sp_tiempo t
       JOIN sp_profesionales p ON p.id=t."profesionalId"
       WHERE t."expedienteId"=$1 AND t."empresaId"=$2
       AND t.facturado=false AND t.facturable=true
       ${desde ? `AND t.fecha>='${desde}'` : ''}
       AND t.fecha<='${hasta}'`,
      [body.expedienteId, eid],
    );

    // Gastos reembolsables no reembolsados
    const gastos = await this.ds.query<any[]>(
      `SELECT * FROM sp_gastos_expediente
       WHERE "expedienteId"=$1 AND "empresaId"=$2
       AND reembolsado=false AND reembolsable=true`,
      [body.expedienteId, eid],
    );

    const totalHoras   = tiempos.reduce((s, t) => s + Number(t.horas), 0);
    const tarifa       = Number(exp.tarifaHoraProyecto ?? 0);
    const montoHoras   = totalHoras * tarifa;
    const gastosMonto  = gastos.reduce((s, g) => s + Number(g.monto), 0);
    const descuento    = Number(body.descuento ?? 0);
    const subtotal     = montoHoras + gastosMonto - descuento;
    const itbis        = body.conItbis ? subtotal * 0.18 : 0;
    const total        = subtotal + itbis;

    const numero = await this.siguienteNumero('sp_facturas_honorarios', 'HON');
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_facturas_honorarios
         ("empresaId",numero,"expedienteId","clienteId","periodoDesde","periodoHasta",
          "horasFacturadas","montoHoras","gastosReembolsables",descuento,itbis,total,
          "fechaVencimiento",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [eid, numero, body.expedienteId, exp.clienteId, desde, hasta,
       totalHoras, montoHoras, gastosMonto, descuento, itbis, total,
       body.fechaVencimiento ?? null, body.notas ?? null],
    );
    const honorario = rows[0];

    // Marcar tiempos como facturados
    if (tiempos.length) {
      const ids = tiempos.map(t => t.id).join(',');
      await this.ds.query(
        `UPDATE sp_tiempo SET facturado=true, "facturaId"=NULL WHERE id IN (${ids}) AND "empresaId"=$1`,
        [eid],
      );
    }
    // Marcar gastos como reembolsados
    if (gastos.length) {
      const ids = gastos.map(g => g.id).join(',');
      await this.ds.query(
        `UPDATE sp_gastos_expediente SET reembolsado=true WHERE id IN (${ids}) AND "empresaId"=$1`,
        [eid],
      );
    }
    // Actualizar totales del expediente
    await this.ds.query(
      `UPDATE sp_expedientes SET "totalFacturado"="totalFacturado"+$1,"updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
      [total, body.expedienteId, eid],
    );
    return { honorario, tiempos, gastos };
  }

  async actualizarHonorario(id: number, data: any) {
    const campos: string[] = [];
    const vals: any[] = [id, this.empresaId];
    const set = (col: string, val: any) => { vals.push(val); campos.push(`"${col}"=$${vals.length}`); };
    if (data.estado           !== undefined) set('estado',           data.estado);
    if (data.fechaEnvio       !== undefined) set('fechaEnvio',       data.fechaEnvio);
    if (data.fechaVencimiento !== undefined) set('fechaVencimiento', data.fechaVencimiento);
    if (data.facturaId        !== undefined) set('facturaId',        data.facturaId);
    if (data.notas            !== undefined) set('notas',            data.notas);
    if (!campos.length) throw new Error('No hay campos para actualizar');
    const rows = await this.ds.query(
      `UPDATE sp_facturas_honorarios SET ${campos.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      vals,
    );
    return rows[0];
  }

  async getHonorario(id: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT h.*, e.nombre AS expedienteNombre, e.numero AS expedienteNumero,
              c.nombre AS clienteNombre, c.rnc AS clienteRnc, c.direccion AS clienteDireccion
       FROM sp_facturas_honorarios h
       JOIN sp_expedientes e ON e.id=h."expedienteId"
       JOIN clientes c ON c.id=h."clienteId"
       WHERE h.id=$1 AND h."empresaId"=$2`,
      [id, this.empresaId],
    );
    if (!rows.length) throw new NotFoundException('Factura de honorarios no encontrada');
    // Detalles de tiempo
    const tiempos = await this.ds.query<any[]>(
      `SELECT t.fecha, t.horas, t.descripcion, t."tarifaHora", t.monto,
              p.nombre AS profesionalNombre, p.apellidos AS profesionalApellidos
       FROM sp_tiempo t
       JOIN sp_profesionales p ON p.id=t."profesionalId"
       WHERE t."expedienteId"=$1 AND t."empresaId"=$2 AND t.facturado=true`,
      [rows[0].expedienteId, this.empresaId],
    );
    return { ...rows[0], tiempos };
  }

  // ── RETAINERS ────────────────────────────────────────────────────────────────

  async getRetainers() {
    return this.ds.query<any[]>(
      `SELECT r.*, e.nombre AS expedienteNombre, c.nombre AS clienteNombre
       FROM sp_retainers r
       JOIN sp_expedientes e ON e.id=r."expedienteId"
       JOIN clientes c ON c.id=r."clienteId"
       WHERE r."empresaId"=$1 AND r."isActive"=true
       ORDER BY r."createdAt" DESC`,
      [this.empresaId],
    );
  }

  async crearRetainer(data: any) {
    const eid = this.empresaId;
    let clienteId = data.clienteId;
    if (!clienteId && data.expedienteId) {
      const exp = await this.ds.query<any[]>(`SELECT "clienteId" FROM sp_expedientes WHERE id=$1 AND "empresaId"=$2`, [data.expedienteId, eid]);
      clienteId = exp[0]?.clienteId;
    }
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_retainers
         ("empresaId","expedienteId","clienteId","montoMensual","horasIncluidas","periodicidad","diaFacturacion","fechaInicio","fechaFin","notas","estado")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,'activo'))
       RETURNING *`,
      [eid, data.expedienteId, clienteId, data.montoMensual,
       data.horasIncluidas ?? null, data.periodicidad ?? 'mensual',
       data.diaFacturacion ?? 1, data.fechaInicio ?? null, data.fechaFin ?? null,
       data.notas ?? null, data.estado ?? null],
    );
    return rows[0];
  }

  async getHistorialRetainer(id: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM sp_retainer_pagos WHERE "retainerId"=$1 AND "empresaId"=$2 ORDER BY periodo DESC`,
      [id, this.empresaId],
    );
  }

  async facturarMesRetainer(id: number) {
    const eid = this.empresaId;
    const rows = await this.ds.query<any[]>(
      `SELECT * FROM sp_retainers WHERE id=$1 AND "empresaId"=$2 AND "isActive"=true`,
      [id, eid],
    );
    if (!rows.length) throw new NotFoundException('Retainer no encontrado');
    const retainer = rows[0];
    const periodo = new Date().toISOString().slice(0, 7); // YYYY-MM
    const existing = await this.ds.query<any[]>(
      `SELECT 1 FROM sp_retainer_pagos WHERE "retainerId"=$1 AND periodo=$2`,
      [id, periodo],
    );
    if (existing.length) throw new Error(`Ya se facturó el período ${periodo}`);
    const horasUsadas = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM(horas),0) AS total FROM sp_tiempo
       WHERE "expedienteId"=$1 AND "empresaId"=$2
       AND fecha >= date_trunc('month', CURRENT_DATE)
       AND fecha < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
      [retainer.expedienteId, eid],
    );
    const horasUsadasNum = Number(horasUsadas[0]?.total ?? 0);
    const horasRestantes = retainer.horasIncluidas ? Math.max(0, retainer.horasIncluidas - horasUsadasNum) : null;
    const pago = await this.ds.query<any[]>(
      `INSERT INTO sp_retainer_pagos
         ("empresaId","retainerId",periodo,monto,"horasUsadas","horasRestantes",estado)
       VALUES ($1,$2,$3,$4,$5,$6,'pendiente')
       RETURNING *`,
      [eid, id, periodo, retainer.montoMensual, horasUsadasNum, horasRestantes],
    );
    return pago[0];
  }

  // ── REPORTES ─────────────────────────────────────────────────────────────────

  async getReporteHorasProfesional(query: any) {
    const eid = this.empresaId;
    const conds = [`t."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.desde)         { vals.push(query.desde); conds.push(`t.fecha>=$${vals.length}`); }
    if (query.hasta)         { vals.push(query.hasta); conds.push(`t.fecha<=$${vals.length}`); }
    if (query.profesionalId) { vals.push(Number(query.profesionalId)); conds.push(`t."profesionalId"=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT p.id, p.nombre, p.apellidos, p.especialidad,
              COALESCE(SUM(t.horas),0) AS totalHoras,
              COALESCE(SUM(CASE WHEN t.facturable THEN t.horas ELSE 0 END),0) AS horasFacturables,
              COALESCE(SUM(CASE WHEN t.facturado THEN t.horas ELSE 0 END),0) AS horasFacturadas,
              COALESCE(SUM(t.monto),0) AS totalMonto,
              p."horasSemanales" * 4 AS capacidadMes
       FROM sp_profesionales p
       LEFT JOIN sp_tiempo t ON t."profesionalId"=p.id AND ${conds.slice(1).join(' AND ')}
       WHERE p."empresaId"=$1 AND p."isActive"=true
       GROUP BY p.id, p.nombre, p.apellidos, p.especialidad, p."horasSemanales"
       ORDER BY totalHoras DESC`,
      vals,
    );
  }

  async getReporteRentabilidad() {
    return this.ds.query<any[]>(
      `SELECT e.id, e.numero, e.nombre, e."presupuestoTotal", e."tipoFacturacion",
              COALESCE(SUM(t.horas),0) AS horasTotales,
              COALESCE(SUM(t.monto),0) AS ingresosTiempo,
              e."totalFacturado", e."totalCobrado",
              CASE WHEN e."presupuestoTotal" > 0
                THEN (e."totalFacturado" / e."presupuestoTotal" * 100)
                ELSE 0 END AS pctPresupuesto
       FROM sp_expedientes e
       LEFT JOIN sp_tiempo t ON t."expedienteId"=e.id
       WHERE e."empresaId"=$1 AND e."isActive"=true
       GROUP BY e.id, e.numero, e.nombre, e."presupuestoTotal", e."tipoFacturacion",
                e."totalFacturado", e."totalCobrado"
       ORDER BY e."totalFacturado" DESC`,
      [this.empresaId],
    );
  }

  async marcarContratoFirmado(id: number) {
    const rows = await this.ds.query<any[]>(
      `UPDATE sp_contratos SET estado='firmado', "fechaFirmaCliente"=NOW()
       WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      [id, this.empresaId],
    );
    if (!rows.length) throw new NotFoundException('Contrato no encontrado');
    return rows[0];
  }

  async marcarHonorarioPagado(id: number, fechaPago: string) {
    const rows = await this.ds.query<any[]>(
      `UPDATE sp_facturas_honorarios SET estado='pagada', "fechaPago"=$1
       WHERE id=$2 AND "empresaId"=$3 RETURNING *`,
      [fechaPago, id, this.empresaId],
    );
    if (!rows.length) throw new NotFoundException('Honorario no encontrado');
    const h = rows[0];
    await this.ds.query(
      `UPDATE sp_expedientes SET "totalCobrado"=COALESCE("totalCobrado",0)+$1 WHERE id=$2 AND "empresaId"=$3`,
      [h.total, h.expedienteId, this.empresaId],
    );
    return h;
  }

  async actualizarRetainer(id: number, data: any) {
    const campos: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = {
      montoMensual: 'montoMensual', horasIncluidas: 'horasIncluidas', estado: 'estado',
      periodicidad: 'periodicidad', diaFacturacion: 'diaFacturacion',
      fechaFin: 'fechaFin', notas: 'notas',
    };
    for (const [k, col] of Object.entries(map)) {
      if (data[k] !== undefined) { vals.push(data[k]); campos.push(`"${col}"=$${vals.length}`); }
    }
    if (!campos.length) throw new Error('Sin campos');
    vals.push(id); vals.push(this.empresaId);
    const rows = await this.ds.query<any[]>(
      `UPDATE sp_retainers SET ${campos.join(',')} WHERE id=$${vals.length - 1} AND "empresaId"=$${vals.length} RETURNING *`,
      vals,
    );
    return rows[0];
  }

  async registrarPagoRetainer(id: number, data: any) {
    const eid = this.empresaId;
    const rows = await this.ds.query<any[]>(
      `INSERT INTO sp_retainer_pagos
         ("empresaId","retainerId",monto,periodo,"fechaPago","metodoPago",referencia,estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pagado')
       RETURNING *`,
      [eid, id, data.monto, data.periodo ?? null, data.fechaPago, data.metodoPago ?? null, data.referencia ?? null],
    );
    return rows[0];
  }

  async getReporteTiempoDetalle(query: any) {
    const eid = this.empresaId;
    const conds = [`t."empresaId"=$1`];
    const vals: any[] = [eid];
    if (query.desde)         { vals.push(query.desde); conds.push(`t.fecha>=$${vals.length}`); }
    if (query.hasta)         { vals.push(query.hasta); conds.push(`t.fecha<=$${vals.length}`); }
    if (query.profesionalId) { vals.push(Number(query.profesionalId)); conds.push(`t."profesionalId"=$${vals.length}`); }
    if (query.expedienteId)  { vals.push(Number(query.expedienteId)); conds.push(`t."expedienteId"=$${vals.length}`); }
    return this.ds.query<any[]>(
      `SELECT t.*, p.nombre AS "profesionalNombre", p.apellidos AS "profesionalApellidos",
              e.nombre AS "expedienteNombre", e.numero AS "expedienteNumero"
       FROM sp_tiempo t
       LEFT JOIN sp_profesionales p ON p.id=t."profesionalId"
       LEFT JOIN sp_expedientes e ON e.id=t."expedienteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY t.fecha DESC, t."createdAt" DESC`,
      vals,
    );
  }
}
