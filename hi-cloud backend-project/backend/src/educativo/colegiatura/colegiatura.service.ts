import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { fechaHoyRD, diferenciaDiasRD } from '../../common/utils/fecha-local.util';
import { redondearMoneda } from '../../common/utils/moneda.util';
import { BecasService, BecaAplicable } from '../becas/becas.service';

@Injectable()
export class ColegiaturaService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly becasSvc: BecasService,
  ) {}

  /**
   * Descuento combinado de plan.descuento (%, comercial) + becas activas del
   * catálogo (aplicaA scoped) sobre un cargo. Las dos fuentes se calculan
   * SIEMPRE sobre montoBase (nunca en cascada — un 10% de plan + una beca del
   * 20% es 30% del original, no 10% y luego 20% sobre el resto), se suman, y
   * el total se topa a montoBase (nunca negativo, nunca mayor al original).
   *
   * Trazabilidad sin tablas nuevas: se devuelve un "concepto" compacto para
   * ed_cargos.concepto (VARCHAR(200), sin ningún consumidor hoy) con el
   * formato `plan:<monto>;beca:<becaId>:<monto>;...;topado` — el nombre de
   * la beca no se guarda (se resuelve con JOIN a ed_becas por becaId al
   * mostrarlo, así nunca queda desincronizado si la beca se renombra).
   * "topado" solo aparece si la suma bruta superó montoBase.
   */
  private calcularDescuento(montoBase: number, descuentoPlanPct: number, becas: BecaAplicable[]) {
    const contribuciones: { fuente: 'plan' | 'beca'; becaId?: number; monto: number }[] = [];

    const montoPlan = redondearMoneda(montoBase * (Number(descuentoPlanPct ?? 0) / 100));
    if (montoPlan > 0) contribuciones.push({ fuente: 'plan', monto: montoPlan });

    for (const b of becas) {
      const monto = b.tipo === 'porcentaje'
        ? redondearMoneda(montoBase * (Number(b.valor) / 100))
        : redondearMoneda(Number(b.valor));
      if (monto > 0) contribuciones.push({ fuente: 'beca', becaId: b.becaId, monto });
    }

    const totalBruto = redondearMoneda(contribuciones.reduce((s, c) => s + c.monto, 0));
    const descuento = redondearMoneda(Math.min(Math.max(totalBruto, 0), montoBase));
    const topado = totalBruto > montoBase;

    const concepto = contribuciones.length
      ? contribuciones.map(c => c.fuente === 'plan' ? `plan:${c.monto}` : `beca:${c.becaId}:${c.monto}`).join(';')
        + (topado ? ';topado' : '')
      : null;

    return { descuento, concepto, topado };
  }

  /**
   * Lee de vuelta el "concepto" técnico (plan:<monto>;beca:<becaId>:<monto>;
   * ...;topado) y lo vuelve una estructura legible — el nombre de la beca se
   * resuelve aparte (ver listCargos) porque el concepto solo guarda el id.
   * Nunca se debe mostrar el string de "concepto" tal cual en una pantalla.
   */
  private parseConcepto(concepto: string | null | undefined): {
    planMonto: number; becas: { becaId: number; monto: number }[]; topado: boolean;
  } | null {
    if (!concepto) return null;
    const partes = concepto.split(';');
    const topado = partes.includes('topado');
    let planMonto = 0;
    const becas: { becaId: number; monto: number }[] = [];
    for (const parte of partes) {
      if (parte === 'topado') continue;
      const [fuente, a, b] = parte.split(':');
      if (fuente === 'plan') planMonto = Number(a) || 0;
      else if (fuente === 'beca') becas.push({ becaId: Number(a), monto: Number(b) || 0 });
    }
    if (!planMonto && !becas.length) return null;
    return { planMonto, becas, topado };
  }

  /** Adjunta `desgloseDescuento` (legible, con nombre de beca) a cada cargo y quita el "concepto" técnico de la respuesta. */
  private async conDesgloseDescuento<T extends { concepto?: string | null }>(cargos: T[]): Promise<T[]> {
    const parsed = cargos.map(c => this.parseConcepto(c.concepto));
    const becaIds = [...new Set(parsed.flatMap(p => p?.becas.map(b => b.becaId) ?? []))];
    const nombres = new Map<number, string>();
    if (becaIds.length) {
      const rows = await this.ds.query<any[]>(`SELECT id, nombre FROM ed_becas WHERE id = ANY($1)`, [becaIds]);
      for (const r of rows) nombres.set(r.id, r.nombre);
    }
    return cargos.map((c, i) => {
      const p = parsed[i];
      const { concepto, ...resto } = c as any;
      return {
        ...resto,
        desgloseDescuento: p
          ? { planMonto: p.planMonto, topado: p.topado, becas: p.becas.map(b => ({ ...b, nombre: nombres.get(b.becaId) ?? `Beca #${b.becaId}` })) }
          : null,
      };
    }) as unknown as T[];
  }

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
              (SELECT COUNT(*) FROM ed_cargos c WHERE c."planPagoId" = p.id AND c.estado IN ('pendiente','parcial'))::int AS "cargosPendientes",
              (SELECT COALESCE(SUM(c."saldoPendiente"),0) FROM ed_cargos c WHERE c."planPagoId" = p.id AND c.estado IN ('pendiente','parcial')) AS "saldoPendiente"
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
        `WITH fila AS (
         UPDATE ed_planes_pago
           SET "montoColegiatura" = $3, "montoMatricula" = $4, "diaCobro" = $5, descuento = $6
           WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
        [existing.id, empresaId,
         dto.montoColegiatura, dto.montoMatricula ?? 0, dto.diaCobro ?? 1, dto.descuento ?? 0],
      );
      return row;
    }
    // "nombre" es NOT NULL sin default en ed_planes_pago; el formulario del
    // frontend no lo pide (piensa el plan como "de este estudiante", sin
    // nombre propio) — sin esto el INSERT revienta con 23502 en cada intento
    // de crear un plan nuevo. Se genera un nombre descriptivo por defecto.
    const nombre = dto.nombre ?? await this.nombrePlanPorDefecto(empresaId, dto.estudianteId, dto.anioEscolarId);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_planes_pago (
         "empresaId", nombre, "estudianteId","anioEscolarId","montoColegiatura","montoMatricula","diaCobro",descuento
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [empresaId, nombre, dto.estudianteId, dto.anioEscolarId,
       dto.montoColegiatura, dto.montoMatricula ?? 0, dto.diaCobro ?? 1, dto.descuento ?? 0],
    );
    return row;
  }

  private async nombrePlanPorDefecto(empresaId: number, estudianteId: number, anioEscolarId: number) {
    const [[est], [anio]] = await Promise.all([
      this.ds.query<any[]>(`SELECT nombres, apellidos FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`, [estudianteId, empresaId]),
      this.ds.query<any[]>(`SELECT nombre FROM ed_anios_escolares WHERE id = $1 AND "empresaId" = $2`, [anioEscolarId, empresaId]),
    ]);
    if (!est) return 'Plan de colegiatura';
    return `Plan de ${est.nombres} ${est.apellidos}${anio ? ` — ${anio.nombre}` : ''}`;
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

      // Modelo de dinero de ed_cargos (reconciliado — antes "monto" y
      // "montoOriginal" coexistían sin relación entre sí, deuda de
      // FixColegiaturaSchema):
      //   montoOriginal   antes de descuento, se fija al crear.
      //   descuento       monto en pesos (no %), suma de plan.descuento +
      //                   becas activas con aplicaA IN ('colegiatura','ambos')
      //                   — ver calcularDescuento(). Se fija al crear.
      //   montoMora       la mantiene el cron de mora (no implementado
      //                   todavía) — 0 al crear.
      //   montoTotal      = montoOriginal - descuento + montoMora. Derivado.
      //   montoPagado     lo abonado. Derivado, solo lo toca registrarPago().
      //   saldoPendiente  = montoTotal - montoPagado. Derivado, mismo punto
      //                   de escritura que montoPagado — nunca por separado.
      const montoOriginal = Number(plan.montoColegiatura);
      const becas = await this.becasSvc.becasAplicables(empresaId, plan.estudianteId, plan.anioEscolarId, 'colegiatura');
      const { descuento, concepto } = this.calcularDescuento(montoOriginal, plan.descuento, becas);
      const montoTotal = montoOriginal - descuento;
      const vencimiento = `${anio}-${String(mes).padStart(2, '0')}-${String(plan.diaCobro ?? 5).padStart(2, '0')}`;
      await this.ds.query(
        `INSERT INTO ed_cargos (
           "empresaId","estudianteId","planPagoId",tipo,descripcion,concepto,
           "montoOriginal",descuento,"montoTotal","montoPagado","saldoPendiente",
           "fechaVencimiento",estado,mes,anio
         ) VALUES ($1,$2,$3,'colegiatura',$4,$5,$6,$7,$8,0,$8,$9,'pendiente',$10,$11)`,
        [empresaId, plan.estudianteId, planId,
         `Colegiatura ${MESES[mes - 1]} ${anio}`, concepto, montoOriginal, descuento, montoTotal, vencimiento, mes, anio],
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
    // plan.descuento nunca se aplicó a la matrícula (comportamiento
    // existente, sin cambios — es un descuento del PLAN de colegiatura, no
    // se extiende aquí). Las becas con aplicaA IN ('inscripcion','ambos')
    // sí aplican — antes ni siquiera se consultaban.
    const montoOriginal = Number(plan.montoMatricula);
    const becas = await this.becasSvc.becasAplicables(empresaId, plan.estudianteId, plan.anioEscolarId, 'inscripcion');
    const { descuento, concepto } = this.calcularDescuento(montoOriginal, 0, becas);
    const montoTotal = montoOriginal - descuento;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_cargos (
         "empresaId","estudianteId","planPagoId",tipo,descripcion,concepto,
         "montoOriginal",descuento,"montoTotal","montoPagado","saldoPendiente",
         "fechaVencimiento",estado,anio
       ) VALUES ($1,$2,$3,'matricula',$4,$5,$6,$7,$8,0,$8,CURRENT_DATE,'pendiente',$9) RETURNING *`,
      [empresaId, plan.estudianteId, planId, `Matrícula ${anio}`, concepto, montoOriginal, descuento, montoTotal, anio],
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
    if (opts.vencidos) {
      // Misma definición de "vencido" que resumenFinanciero() — desde que
      // el cron de mora mantiene el estado real, ya no hace falta el OR de
      // respaldo sobre fechaVencimiento para cargos 'pendiente' que el cron
      // aún no tocó hoy, pero se deja por si el cron no ha corrido todavía.
      conds.push(`(c.estado IN ('vencido','parcial') OR (c.estado = 'pendiente' AND c."fechaVencimiento" < CURRENT_DATE))`);
    }
    if (opts.q) {
      conds.push(`(e.nombres ILIKE $${idx} OR e.apellidos ILIKE $${idx} OR e.cedula ILIKE $${idx})`);
      params.push(`%${opts.q}%`); idx++;
    }
    const cargos = await this.ds.query<any[]>(
      `SELECT c.*,
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              e.cedula AS "estudianteCedula"
       FROM ed_cargos c
       JOIN ed_estudiantes e ON e.id = c."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY c."fechaVencimiento", e.apellidos`,
      params,
    );
    return this.conCondonaciones(await this.conDesgloseDescuento(cargos));
  }

  /** Adjunta `condonacionesMora` (lista) a cada cargo que tenga alguna — visible en el desglose. */
  private async conCondonaciones<T extends { id: number; moraCondonada?: boolean }>(cargos: T[]): Promise<T[]> {
    const idsConCondonacion = cargos.filter(c => c.moraCondonada).map(c => c.id);
    if (!idsConCondonacion.length) return cargos.map(c => ({ ...c, condonacionesMora: [] }));

    const rows = await this.ds.query<any[]>(
      `SELECT * FROM ed_cargos_condonaciones WHERE "cargoId" = ANY($1) ORDER BY "createdAt" DESC`,
      [idsConCondonacion],
    );
    const porCargo = new Map<number, any[]>();
    for (const r of rows) {
      if (!porCargo.has(r.cargoId)) porCargo.set(r.cargoId, []);
      porCargo.get(r.cargoId)!.push(r);
    }
    return cargos.map(c => ({ ...c, condonacionesMora: porCargo.get(c.id) ?? [] }));
  }

  // ── Condonar mora ────────────────────────────────────────────────────────

  /**
   * Perdona la mora ACTUAL de un cargo (motivo obligatorio, auditado en
   * ed_cargos_condonaciones). moraCondonada=true saca al cargo del cron para
   * siempre — condonar no serviría de nada si la mora reaparece mañana.
   * No toca diasMora: es el registro histórico de cuántos días estuvo en
   * mora hasta este punto, independiente de que se haya perdonado el monto.
   */
  async condonarMora(empresaId: number, cargoId: number, dto: { motivo: string }, usuarioId?: number) {
    return this.ds.transaction(async (manager) => {
      const [cargo] = await manager.query<any[]>(
        `SELECT * FROM ed_cargos WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [cargoId, empresaId],
      );
      if (!cargo) throw new NotFoundException('Cargo no encontrado');
      const montoMoraActual = Number(cargo.montoMora ?? 0);
      if (montoMoraActual <= 0) throw new BadRequestException('Este cargo no tiene mora que condonar');

      const baseSinMora = Number(cargo.montoOriginal ?? 0) - Number(cargo.descuento ?? 0);
      const montoTotal = redondearMoneda(baseSinMora);
      const saldoPendiente = Math.max(redondearMoneda(montoTotal - Number(cargo.montoPagado ?? 0)), 0);
      const nuevoEstado = saldoPendiente <= 0 ? 'pagado' : cargo.estado;

      await manager.query(
        `UPDATE ed_cargos
           SET "montoMora" = 0, "montoTotal" = $1, "saldoPendiente" = $2, estado = $3, "moraCondonada" = true
         WHERE id = $4 AND "empresaId" = $5`,
        [montoTotal, saldoPendiente, nuevoEstado, cargoId, empresaId],
      );

      const [condonacion] = await manager.query<any[]>(
        `INSERT INTO ed_cargos_condonaciones ("empresaId","cargoId","montoCondonado",motivo,"usuarioId")
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [empresaId, cargoId, montoMoraActual, dto.motivo, usuarioId ?? null],
      );

      const [actualizado] = await manager.query<any[]>(`SELECT * FROM ed_cargos WHERE id = $1`, [cargoId]);
      return { cargo: actualizado, condonacion };
    });
  }

  async addCargo(empresaId: number, dto: any) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [dto.estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');
    const montoOriginal = Number(dto.montoOriginal);
    const descuento = Number(dto.descuento ?? 0);
    const montoTotal = montoOriginal - descuento;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_cargos (
         "empresaId","estudianteId","planPagoId",tipo,descripcion,
         "montoOriginal",descuento,"montoTotal","montoPagado","saldoPendiente",
         "fechaVencimiento",estado,mes,anio
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$8,$9,'pendiente',$10,$11) RETURNING *`,
      [empresaId, dto.estudianteId, dto.planPagoId ?? null,
       dto.tipo ?? 'otro', dto.descripcion, montoOriginal, descuento, montoTotal,
       dto.fechaVencimiento ?? null, dto.mes ?? null, dto.anio ?? null],
    );
    return row;
  }

  async updateCargo(empresaId: number, id: number, dto: any) {
    // Bloqueo pesimista sobre el cargo (mismo mecanismo que
    // lock: { mode: 'pessimistic_write' } de caja.service.ts:833, expresado
    // en SQL crudo — el estilo de todo este service) — si se edita
    // montoOriginal/descuento a la vez que un pago está en curso sobre el
    // mismo cargo, uno de los dos espera al otro en vez de pisarlo.
    //
    // Nota: editar descuento aquí no actualiza "concepto" (la traza de
    // plan/becas que lo compone) — es una corrección manual del monto, no
    // un recálculo de becas. El concepto de creación queda como referencia
    // histórica de por qué se generó ese descuento originalmente.
    return this.ds.transaction(async (manager) => {
      const [cargo] = await manager.query<any[]>(
        `SELECT * FROM ed_cargos WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [id, empresaId],
      );
      if (!cargo) throw new NotFoundException('Cargo no encontrado');

      // "estado", "montoPagado" y "saldoPendiente" NO están aquí a propósito
      // (ver UpdateCargoDto) — son derivadas del historial de pagos; solo
      // registrarPago() las toca, en un único punto de escritura.
      const FIELDS = ['descripcion', 'montoOriginal', 'descuento', 'fechaVencimiento'];
      const fields = FIELDS.filter(f => dto[f] !== undefined);
      if (!fields.length) return cargo;

      const sets = fields.map((f, i) => `"${f}" = $${i + 3}`);
      const params: any[] = [id, empresaId, ...fields.map(f => dto[f])];

      // montoTotal/saldoPendiente son derivadas de montoOriginal/descuento —
      // si cualquiera de las dos cambia, las dos se recalculan aquí mismo,
      // nunca por separado (saldoPendiente no puede quedar negativa: un
      // pago ya cobrado no se "revierte" por editar el monto del cargo).
      if (fields.includes('montoOriginal') || fields.includes('descuento')) {
        const montoOriginal = fields.includes('montoOriginal') ? Number(dto.montoOriginal) : Number(cargo.montoOriginal);
        const descuento = fields.includes('descuento') ? Number(dto.descuento) : Number(cargo.descuento ?? 0);
        const montoTotal = montoOriginal - descuento;
        const saldoPendiente = Math.max(montoTotal - Number(cargo.montoPagado ?? 0), 0);
        sets.push(`"montoTotal" = $${params.length + 1}`);      params.push(montoTotal);
        sets.push(`"saldoPendiente" = $${params.length + 1}`);  params.push(saldoPendiente);
      }

      const [row] = await manager.query(
        `WITH fila AS (
           UPDATE ed_cargos SET ${sets.join(', ')} WHERE id = $1 AND "empresaId" = $2 RETURNING *
         ) SELECT * FROM fila`,
        params,
      );
      return row;
    });
  }

  // ── Pagos ───────────────────────────────────────────────────────────────────
  //
  // Un pago puede cubrir VARIOS cargos (ed_pagos_detalle) — el tutor que
  // llega a pagar tres cuotas atrasadas de una vez es el caso normal, no la
  // excepción. Se aplica siempre empezando por el cargo con fechaVencimiento
  // más antigua ("el más atrasado primero"), sin importar el orden en que
  // el caller haya listado los cargoIds. Si el monto no alcanza para todos,
  // los últimos simplemente no reciben fila de detalle — nunca una fila de
  // $0 fingiendo que se aplicó algo.

  /**
   * Estado derivado de un cargo tras aplicar (o revertir) un pago — nunca
   * se decide en dos sitios distintos. `fechaVencimiento` puede venir como
   * Date de JS (medianoche UTC del día guardado, el driver de Postgres
   * nunca lo entrega como string desde un SELECT *) o como string — se
   * compara siempre con diferenciaDiasRD(), nunca con un operador `<`
   * directo entre un Date y un string (ahí fue el bug real de transporte).
   */
  private estadoCargoTrasPago(saldoPendiente: number, montoPagado: number, fechaVencimiento: Date | string | null): string {
    if (saldoPendiente <= 0) return 'pagado';
    if (fechaVencimiento && diferenciaDiasRD(fechaVencimiento) > 0) return 'vencido';
    return montoPagado > 0 ? 'parcial' : 'pendiente';
  }

  /** Recalcula montoPagado/saldoPendiente/estado de UN cargo ya bloqueado (FOR UPDATE) sumando su detalle de pagos activos — nunca por suma incremental, para no arrastrar drift. */
  private async recalcularCargoTrasPagos(manager: EntityManager, empresaId: number, cargo: any) {
    const [{ total }] = await manager.query<any[]>(
      `SELECT COALESCE(SUM(d.monto), 0)::numeric AS total
       FROM ed_pagos_detalle d
       JOIN ed_pagos p ON p.id = d."pagoId" AND p.estado = 'activo'
       WHERE d."cargoId" = $1`,
      [cargo.id],
    );
    const montoPagado = Number(total);
    const saldoPendiente = Math.max(redondearMoneda(Number(cargo.montoTotal) - montoPagado), 0);
    const nuevoEstado = this.estadoCargoTrasPago(saldoPendiente, montoPagado, cargo.fechaVencimiento);
    await manager.query(
      `UPDATE ed_cargos SET "montoPagado" = $1, "saldoPendiente" = $2, estado = $3 WHERE id = $4 AND "empresaId" = $5`,
      [montoPagado, saldoPendiente, nuevoEstado, cargo.id, empresaId],
    );
    return { montoPagado, saldoPendiente, estado: nuevoEstado };
  }

  async listPagos(empresaId: number, opts: {
    estudianteId?: number; fechaInicio?: string; fechaFin?: string;
  } = {}) {
    const conds: string[] = [`p."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.estudianteId) { conds.push(`p."estudianteId" = $${idx}`); params.push(opts.estudianteId); idx++; }
    if (opts.fechaInicio)  { conds.push(`p.fecha >= $${idx}`);         params.push(opts.fechaInicio);  idx++; }
    if (opts.fechaFin)     { conds.push(`p.fecha <= $${idx}`);         params.push(opts.fechaFin);     idx++; }
    const pagos = await this.ds.query<any[]>(
      `SELECT p.*, e.nombres || ' ' || e.apellidos AS "estudianteNombre"
       FROM ed_pagos p
       JOIN ed_estudiantes e ON e.id = p."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY p.fecha DESC, p."createdAt" DESC`,
      params,
    );
    if (!pagos.length) return pagos;

    const detalle = await this.ds.query<any[]>(
      `SELECT d.*, c.descripcion AS "cargoDescripcion", c.tipo AS "cargoTipo"
       FROM ed_pagos_detalle d
       JOIN ed_cargos c ON c.id = d."cargoId"
       WHERE d."pagoId" = ANY($1)
       ORDER BY d.id`,
      [pagos.map(p => p.id)],
    );
    const porPago = new Map<number, any[]>();
    for (const d of detalle) {
      if (!porPago.has(d.pagoId)) porPago.set(d.pagoId, []);
      porPago.get(d.pagoId)!.push(d);
    }
    return pagos.map(p => ({ ...p, aplicaciones: porPago.get(p.id) ?? [] }));
  }

  async registrarPago(empresaId: number, dto: any) {
    const cargoIdsRaw: any[] = dto.cargoIds ?? (dto.cargoId ? [dto.cargoId] : []);
    const cargoIds: number[] = [...new Set(cargoIdsRaw.map((c: any) => Number(c)))];
    if (!cargoIds.length) throw new BadRequestException('Debe indicar al menos un cargo');

    const hoy = fechaHoyRD();

    // Bloqueo pesimista sobre TODOS los cargos involucrados, en orden
    // estable por id (nunca por fechaVencimiento) — así dos pagos
    // concurrentes que comparten cargos siempre piden los locks en el
    // mismo orden entre sí y no se pueden hacer deadlock cruzado.
    return this.ds.transaction(async (manager) => {
      const cargos = await manager.query<any[]>(
        `SELECT * FROM ed_cargos WHERE id = ANY($1) AND "empresaId" = $2 ORDER BY id FOR UPDATE`,
        [cargoIds, empresaId],
      );
      if (cargos.length !== cargoIds.length) throw new NotFoundException('Uno o más cargos no existen');

      const estudianteId = dto.estudianteId ?? cargos[0].estudianteId;
      for (const c of cargos) {
        if (c.estudianteId !== estudianteId) throw new BadRequestException('Todos los cargos de un mismo pago deben ser del mismo estudiante');
        if (c.estado === 'pagado') throw new BadRequestException(`El cargo #${c.id} ya fue pagado`);
        if (c.estado === 'anulado') throw new BadRequestException(`El cargo #${c.id} está anulado`);
      }

      // Se aplica al más atrasado primero, sin importar el orden de cargoIds.
      const cargosOrdenados = [...cargos].sort((a, b) => {
        const fa = a.fechaVencimiento ?? '9999-99-99';
        const fb = b.fechaVencimiento ?? '9999-99-99';
        return fa < fb ? -1 : fa > fb ? 1 : a.id - b.id;
      });

      const totalPendiente = redondearMoneda(cargosOrdenados.reduce((s, c) => s + Number(c.saldoPendiente), 0));
      const montoPago = redondearMoneda(Number(dto.monto ?? totalPendiente));
      if (!(montoPago > 0)) throw new BadRequestException('El monto del pago debe ser mayor que cero');
      if (montoPago > totalPendiente) {
        throw new BadRequestException(
          `El monto (${montoPago}) supera lo pendiente de los cargos seleccionados (${totalPendiente})`,
        );
      }

      const [pago] = await manager.query<any[]>(
        `INSERT INTO ed_pagos (
           "empresaId","estudianteId","montoPagado",fecha,"metodoPago",referencia,observaciones
         ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [empresaId, estudianteId, montoPago,
         dto.fecha ?? hoy, dto.metodoPago ?? 'efectivo', dto.referencia ?? null, dto.observaciones ?? null],
      );

      let restante = montoPago;
      const cargosActualizados: any[] = [];
      for (const cargo of cargosOrdenados) {
        if (restante <= 0) break;
        const aplicado = redondearMoneda(Math.min(restante, Number(cargo.saldoPendiente)));
        if (aplicado <= 0) continue;

        await manager.query(
          `INSERT INTO ed_pagos_detalle ("empresaId","pagoId","cargoId",monto) VALUES ($1,$2,$3,$4)`,
          [empresaId, pago.id, cargo.id, aplicado],
        );
        restante = redondearMoneda(restante - aplicado);
        const resultado = await this.recalcularCargoTrasPagos(manager, empresaId, cargo);
        cargosActualizados.push({ cargoId: cargo.id, aplicado, ...resultado });
      }

      return { pago, cargosActualizados };
    });
  }

  /**
   * Anula un pago sin borrarlo — devuelve el saldo a los cargos que había
   * cubierto (recalculando desde ed_pagos_detalle, nunca restando a mano) y
   * deja el registro con estado='anulado' + motivo + quién + cuándo. Nunca
   * toca montoTotal/montoMora — respeta lo que el cron de mora ya haya
   * calculado sobre esos cargos; solo recalcula montoPagado/saldoPendiente/
   * estado, el mismo trío que registrarPago() y el cron ya tratan como una
   * sola unidad de escritura.
   */
  async anularPago(empresaId: number, pagoId: number, dto: { motivo: string }, usuarioId?: number) {
    return this.ds.transaction(async (manager) => {
      const [pago] = await manager.query<any[]>(
        `SELECT * FROM ed_pagos WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [pagoId, empresaId],
      );
      if (!pago) throw new NotFoundException('Pago no encontrado');
      if (pago.estado === 'anulado') throw new BadRequestException('Este pago ya está anulado');

      const detalle = await manager.query<any[]>(
        `SELECT * FROM ed_pagos_detalle WHERE "pagoId" = $1 ORDER BY "cargoId"`,
        [pagoId],
      );

      // Mismo orden estable por id que registrarPago() — evita deadlock
      // cruzado si un pago concurrente sobre alguno de estos cargos está
      // en curso al mismo tiempo.
      const cargoIds = [...new Set(detalle.map((d: any) => d.cargoId))].sort((a: any, b: any) => a - b);
      const cargos = cargoIds.length
        ? await manager.query<any[]>(
            `SELECT * FROM ed_cargos WHERE id = ANY($1) AND "empresaId" = $2 ORDER BY id FOR UPDATE`,
            [cargoIds, empresaId],
          )
        : [];

      await manager.query(
        `UPDATE ed_pagos
           SET estado = 'anulado', "motivoAnulacion" = $1, "anuladoPor" = $2, "anuladoEn" = NOW()
         WHERE id = $3 AND "empresaId" = $4`,
        [dto.motivo, usuarioId ?? null, pagoId, empresaId],
      );

      const cargosActualizados: any[] = [];
      for (const cargo of cargos) {
        const resultado = await this.recalcularCargoTrasPagos(manager, empresaId, cargo);
        cargosActualizados.push({ cargoId: cargo.id, ...resultado });
      }

      const [actualizado] = await manager.query<any[]>(`SELECT * FROM ed_pagos WHERE id = $1`, [pagoId]);
      return { pago: actualizado, cargosActualizados };
    });
  }

  async resumenFinanciero(empresaId: number, anioEscolarId?: number) {
    const joinCond = anioEscolarId
      ? `JOIN ed_planes_pago pp ON pp.id = c."planPagoId" AND pp."anioEscolarId" = $2`
      : '';
    const params = anioEscolarId ? [empresaId, anioEscolarId] : [empresaId];

    const [res] = await this.ds.query<any[]>(
      `SELECT
         COALESCE(SUM(c."saldoPendiente") FILTER (WHERE c.estado IN ('pendiente','parcial')),0)::numeric AS pendiente,
         COALESCE(SUM(c."montoPagado"),0)::numeric AS cobrado,
         COALESCE(SUM(c."saldoPendiente") FILTER (WHERE c.estado IN ('vencido','parcial') OR (c.estado = 'pendiente' AND c."fechaVencimiento" < CURRENT_DATE)),0)::numeric AS vencido,
         COUNT(*) FILTER (WHERE c.estado IN ('pendiente','parcial'))::int AS cargosPendientes,
         COUNT(DISTINCT c."estudianteId") FILTER (WHERE c.estado IN ('pendiente','parcial') AND c."fechaVencimiento" < CURRENT_DATE)::int AS morosos
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
