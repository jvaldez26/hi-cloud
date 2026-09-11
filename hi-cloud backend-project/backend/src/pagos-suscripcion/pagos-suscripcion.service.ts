import * as fs   from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import {
  Injectable, Logger, NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { S3Service }           from '../common/s3/s3.service';
import { EmailService }        from '../notificaciones/services/email.service';
import { TenantService }       from '../tenant/tenant.service';
import { PagoSuscripcion, TipoPago, EstadoPago } from './entities/pago-suscripcion.entity';
import { ConfiguracionBancaria }                  from './entities/configuracion-bancaria.entity';
import {
  RegistrarPagoDto, ConfirmarPagoDto, RechazarPagoDto,
  AgregarCargoDto, AplicarCreditoDto, UpdateConfiguracionBancariaDto,
} from './dto/pagos-suscripcion.dto';
import { fechaTextoRD, fechaISOaDO } from '../common/utils/fecha-local.util';
import { finInclusivo } from '../suscripciones/ciclo-facturacion.util';
import { CuotaEcfService } from '../suscripciones/cuota-ecf.service';
import { fechaDeVencimiento } from './preview-pago.util';
import { redondearMoneda } from '../common/utils/moneda.util';
import {
  imputarPago, OverrideImputacion, ResultadoImputacion,
} from './imputacion-pago.util';
import { calcularDeudaSuscripcion } from './deuda-suscripcion.util';


@Injectable()
export class PagosSuscripcionService {
  private readonly logger = new Logger(PagosSuscripcionService.name);

  constructor(
    @InjectRepository(PagoSuscripcion)
    private pagoRepo: Repository<PagoSuscripcion>,
    @InjectRepository(ConfiguracionBancaria)
    private bancoRepo: Repository<ConfiguracionBancaria>,
    private ds:         DataSource,
    private s3:         S3Service,
    private emailSvc:   EmailService,
    private tenantSvc:  TenantService,
    private cuotaEcf:   CuotaEcfService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CLIENTE — Mi suscripción y pagos
  // ──────────────────────────────────────────────────────────────────────────

  async getMiResumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [sus] = await this.ds.query<any[]>(`
      SELECT s.*, e.nombre AS "empresaNombre", e.email AS "empresaEmail"
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s."empresaId" = $1
    `, [empresaId]);

    if (!sus) throw new NotFoundException('Suscripción no encontrada');

    const hoy = new Date();
    const fechaEfectiva = sus.estado === 'prueba'
      ? (sus.fechaFinPrueba ?? sus.fechaVencimiento)
      : sus.fechaVencimiento;
    const fechaVence = new Date(fechaEfectiva);
    const diasRestantes = Math.ceil((fechaVence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    const diasTotales = Math.ceil(
      (fechaVence.getTime() - new Date(sus.fechaInicio).getTime()) / (1000 * 60 * 60 * 24)
    );

    const pcRows = await this.ds.query<any[]>(
      `SELECT precio FROM plan_configuracion WHERE clave = $1 AND activo = true LIMIT 1`,
      [sus.plan],
    );
    const precioMensual = Number(pcRows[0]?.precio ?? 0);
    const saldoPendiente = await this.getSaldoPendiente(empresaId);

    // Deuda por períodos vencidos — parte de fechaVencimiento (NUNCA de
    // fechaFinPrueba, que queda pegado indefinidamente tras salir de prueba).
    // Ver deuda-suscripcion.util.ts.
    const deudaSuscripcion = calcularDeudaSuscripcion({
      estado:           sus.estado,
      fechaVencimiento: sus.fechaVencimiento,
      diaCorte:         Number(sus.diaCorte),
      modalidad:        sus.modalidad ?? 'mensual',
      precioMensual,
    });
    this.reportarTopeDeudaSiAplica(empresaId, deudaSuscripcion);

    const enGracia = sus.enPeriodoGracia === true;
    const fechaFinGracia = sus.fechaFinGracia ? new Date(sus.fechaFinGracia) : null;
    const diasGraciaRestantes = enGracia && fechaFinGracia
      ? Math.max(0, Math.ceil((fechaFinGracia.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      plan:           sus.plan,
      estado:         sus.estado,
      modalidad:      sus.modalidad ?? 'mensual',
      precioMensual,
      fechaInicio:    sus.fechaInicio,
      fechaVencimiento: fechaEfectiva,
      diasRestantes,
      diasTotales:    Math.max(diasTotales, diasRestantes),
      porcentajeUsado: diasTotales > 0
        ? Math.max(0, Math.min(100, Math.round(((diasTotales - diasRestantes) / diasTotales) * 100)))
        : 0,
      saldo:              saldoPendiente,
      saldoSuscripcion:   deudaSuscripcion.monto,
      enPeriodoGracia:    enGracia,
      fechaFinGracia:     sus.fechaFinGracia ?? null,
      diasGraciaRestantes,
    };
  }

  /**
   * Cuenta regresiva de seguridad, no financiera: si calcularDeudaSuscripcion
   * tuvo que cortar en el tope, hay algo raro (años sin pagar, un dato
   * corrupto) que vale la pena que alguien mire — nunca bloquea la respuesta.
   */
  private reportarTopeDeudaSiAplica(
    empresaId: number,
    deuda: { periodosVencidos: number; monto: number; tope: boolean },
  ): void {
    if (!deuda.tope) return;
    this.logger.warn(
      `[deuda-suscripcion] Empresa #${empresaId} superó el tope de períodos vencidos ` +
      `(${deuda.periodosVencidos}) — monto reportado incompleto: RD$${deuda.monto}`,
    );
    Sentry.captureMessage('[deuda-suscripcion] Tope de períodos vencidos alcanzado', {
      level: 'warning',
      tags:  { area: 'pagos-suscripcion', motivo: 'tope-periodos-vencidos' },
      extra: { empresaId, periodosVencidos: deuda.periodosVencidos, monto: deuda.monto },
    });
  }

  async getHistorialCliente() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rows = await this.pagoRepo.find({
      where:  { empresaId },
      order:  { creadoEn: 'DESC' },
    });
    // TypeORM con pg devuelve numeric como string — normalizar
    return rows.map(r => ({ ...r, monto: Number(r.monto ?? 0), montoPagado: Number(r.montoPagado ?? 0) }));
  }

  async getSaldoPendiente(empresaId: number): Promise<number> {
    const rows = await this.ds.query<{ saldo: string }[]>(`
      SELECT COALESCE(SUM(
        CASE
          WHEN tipo = 'CARGO'
            THEN  monto
          WHEN tipo IN ('TRANSFERENCIA','TARJETA','MANUAL','CREDITO')
               AND estado = 'CONFIRMADO'
            THEN -monto
          ELSE 0
        END
      ), 0)::float AS saldo
      FROM pagos_suscripcion
      WHERE "empresaId" = $1
        AND estado != 'RECHAZADO'
    `, [empresaId]);
    return Number(rows[0]?.saldo ?? 0);
  }

  async getConfiguracionBancaria() {
    const cfg = await this.bancoRepo.findOne({ where: { activo: true }, order: { id: 'DESC' } });
    return cfg ?? null;
  }

  /**
   * Cliente sube comprobante de transferencia bancaria.
   * Crea registro PENDIENTE → super admin confirma o rechaza.
   */
  async subirComprobante(
    file:  { buffer: Buffer; originalname: string; mimetype: string; size: number },
    monto: number,
    referencia?: string,
    banco?:      string,
    notas?:      string,
  ) {
    const empresaId = this.tenantSvc.getEmpresaId();

    let comprobanteUrl: string | null = null;
    if (this.s3.isEnabled) {
      comprobanteUrl = await this.s3.upload(
        file.buffer,
        file.originalname,
        file.mimetype,
        'comprobantes',
        empresaId,
      );
    } else {
      // Fallback: disco local → Nginx sirve /uploads/comprobantes/ como estático
      const ext      = path.extname(file.originalname).toLowerCase() || '.bin';
      const filename = `${randomUUID()}${ext}`;
      const uploadDir = '/var/www/hicloudrd.com/html/uploads/comprobantes';
      const filePath  = path.join(uploadDir, filename);
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(filePath, file.buffer);
        comprobanteUrl = `https://hicloudrd.com/uploads/comprobantes/${filename}`;
        this.logger.log(`Comprobante guardado localmente: ${filePath}`);
      } catch (e: any) {
        this.logger.error(`Error guardando comprobante local: ${e?.message}`);
      }
    }

    const pago = this.pagoRepo.create({
      empresaId,
      tipo:          TipoPago.TRANSFERENCIA,
      concepto:      `Pago por transferencia bancaria${banco ? ` — ${banco}` : ''}`,
      monto,
      estado:        EstadoPago.PENDIENTE,
      comprobanteUrl,
      referencia:    referencia ?? null,
      notas:         notas ?? null,
    });
    const saved = await this.pagoRepo.save(pago);

    // Notificar super admin
    await this.notificarSuperAdminComprobante(saved, empresaId).catch(e =>
      this.logger.warn(`Email comprobante: ${e?.message}`)
    );

    return saved;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUPER ADMIN — Gestión de cobros
  // ──────────────────────────────────────────────────────────────────────────

  async listarPagosAdmin(estado?: string) {
    const where = estado ? `WHERE p.estado = $1` : '';
    const params = estado ? [estado] : [];

    const rows = await this.ds.query<any[]>(`
      SELECT p.*,
             e.nombre AS "empresaNombre", e.rnc,
             s.plan, s.estado AS "estadoSuscripcion",
             to_char(s."fechaVencimiento", 'YYYY-MM-DD') AS "venceSuscripcion"
      FROM pagos_suscripcion p
      JOIN empresa e     ON e.id = p."empresaId"
      LEFT JOIN suscripciones s ON s."empresaId" = p."empresaId"
      ${where}
      ORDER BY p."creadoEn" DESC
      LIMIT 200
    `, params);
    // PostgreSQL devuelve numeric como string — normalizar a JS number
    return rows.map(r => ({ ...r, monto: Number(r.monto ?? 0) }));
  }

  async listarComprobantesPeridentes() {
    const rows = await this.ds.query<any[]>(`
      SELECT p.*,
             e.nombre AS "empresaNombre", e.email AS "empresaEmail"
      FROM pagos_suscripcion p
      JOIN empresa e ON e.id = p."empresaId"
      WHERE p.tipo = 'TRANSFERENCIA' AND p.estado = 'PENDIENTE'
      ORDER BY p."creadoEn" DESC
    `);
    // Cada fila viaja con su imputación ya calculada: el admin confirma con
    // el mismo desglose que el backend va a aplicar, no con una segunda
    // cuenta hecha en el navegador — misma fuente que previewPago/registrarPago.
    const out: any[] = [];
    for (const r of rows) {
      const monto = Number(r.monto ?? 0);
      const { resultado } = await this.calcularImputacion(r.empresaId, monto, null);
      out.push({ ...r, monto, preview: resultado });
    }
    return out;
  }

  /** Resumen por empresa para el panel de cobros */
  async resumenCobros() {
    const rows = await this.ds.query<any[]>(`
      SELECT
        e.id AS "empresaId",
        e.nombre,
        e.email,
        s.plan,
        s.estado AS "estadoSuscripcion",
        s.modalidad,
        s."diaCorte",
        to_char(s."fechaVencimiento", 'YYYY-MM-DD') AS "venceSuscripcion",
        s."abonoDisponible"::float AS "abonoDisponible",
        pc.precio::float AS "precioMensual",
        COALESCE(SUM(
          CASE
            WHEN p.tipo = 'CARGO'                                                        THEN  p.monto
            WHEN p.tipo IN ('TRANSFERENCIA','TARJETA','MANUAL') AND p.estado = 'CONFIRMADO' THEN -p.monto
            WHEN p.tipo = 'CREDITO'                             AND p.estado = 'CONFIRMADO' THEN -p.monto
            ELSE 0
          END
        ), 0)::float AS saldo,
        COALESCE(cp."saldoCargos", 0)::float AS "saldoCargos",
        MAX(CASE WHEN p.estado = 'CONFIRMADO' THEN p."confirmadoEn" END) AS "ultimoPago",
        COUNT(CASE WHEN p.tipo = 'TRANSFERENCIA' AND p.estado = 'PENDIENTE' THEN 1 END)::int AS "pendientesConfirmacion"
      FROM empresa e
      LEFT JOIN suscripciones s ON s."empresaId" = e.id
      LEFT JOIN plan_configuracion pc ON pc.clave = s.plan::text AND pc.activo = true
      LEFT JOIN pagos_suscripcion p ON p."empresaId" = e.id AND p.estado != 'RECHAZADO'
      LEFT JOIN (
        SELECT "empresaId", SUM(monto - "montoPagado") AS "saldoCargos"
        FROM pagos_suscripcion
        WHERE tipo = 'CARGO' AND estado != 'RECHAZADO' AND monto > "montoPagado"
        GROUP BY "empresaId"
      ) cp ON cp."empresaId" = e.id
      WHERE e."isActive" = true
      GROUP BY e.id, e.nombre, e.email, s.plan, s.estado, s.modalidad, s."diaCorte",
               s."fechaVencimiento", s."abonoDisponible", pc.precio, cp."saldoCargos"
      ORDER BY saldo DESC, e.nombre
    `);
    // Garantizar tipos JS correctos (PostgreSQL devuelve numeric/int como string vía ds.query)
    return rows.map(r => {
      const precioMensual = Number(r.precioMensual ?? 0);
      // LEFT JOIN suscripciones: una empresa sin fila de suscripción no tiene
      // nada que devengar todavía.
      const deudaSuscripcion = (r.venceSuscripcion == null || r.estadoSuscripcion == null)
        ? { periodosVencidos: 0, monto: 0, tope: false }
        : calcularDeudaSuscripcion({
            estado:           r.estadoSuscripcion,
            fechaVencimiento: r.venceSuscripcion,
            diaCorte:         Number(r.diaCorte ?? 1),
            modalidad:        r.modalidad ?? 'mensual',
            precioMensual,
          });
      this.reportarTopeDeudaSiAplica(r.empresaId, deudaSuscripcion);

      return {
        ...r,
        saldo:                  Number(r.saldo                  ?? 0),
        saldoCargos:            Number(r.saldoCargos            ?? 0),
        saldoSuscripcion:       deudaSuscripcion.monto,
        abonoDisponible:        Number(r.abonoDisponible         ?? 0),
        pendientesConfirmacion: Number(r.pendientesConfirmacion  ?? 0),
        precioMensual,
      };
    });
  }

  /**
   * Lee suscripción + cargos pendientes + abono y aplica el orden de
   * imputación único (cargos → períodos → abono) — ver imputacion-pago.util.ts.
   *
   * `manager` permite leerlo y usarlo DENTRO de la misma transacción que va a
   * persistir el resultado (registrarPago, confirmarTransferencia): sin esto,
   * dos pagos simultáneos podrían leer el mismo cargo "pendiente" y liquidarlo
   * dos veces. Sin `manager` (previewPago, listarComprobantesPeridentes) es
   * una lectura suelta, de solo consulta.
   *
   * `sus: null` significa que la empresa no tiene fila en `suscripciones` —
   * no es un error, el resultado queda vacío (todo el monto como abono, sin
   * tocar períodos), igual que se comportaba el código anterior.
   */
  private async calcularImputacion(
    empresaId: number,
    monto: number,
    override: OverrideImputacion | undefined,
    manager?: EntityManager,
  ): Promise<{ sus: any | null; precio: number; resultado: ResultadoImputacion }> {
    const runner = manager ?? this.ds;

    const [sus] = await runner.query(`
      SELECT s.plan, s.estado, s.modalidad, s."fechaVencimiento", s."diaCorte",
             s."abonoDisponible",
             pc.precio::float AS precio
      FROM suscripciones s
      LEFT JOIN plan_configuracion pc ON pc.clave = s.plan::text AND pc.activo = true
      WHERE s."empresaId" = $1
    `, [empresaId]);

    if (!sus) {
      const montoRedondeado = redondearMoneda(Number(monto ?? 0));
      const vacio: ResultadoImputacion = {
        montoTotalImputado: montoRedondeado,
        cargosLiquidados:   [],
        montoACargos:       0,
        montoAPeriodos:     0,
        periodos:           0,
        precioPorPeriodo:   0,
        nuevaFecha:         null,
        faltante:           0,
        enPasado:           false,
        sinPrecio:          false,
        abonoFinal:         montoRedondeado,
      };
      return { sus: null, precio: 0, resultado: vacio };
    }

    const cargosPendientes = await runner.query(`
      SELECT id, concepto, monto, "montoPagado"
      FROM pagos_suscripcion
      WHERE "empresaId" = $1 AND tipo = 'CARGO' AND estado != 'RECHAZADO'
        AND monto > "montoPagado"
      ORDER BY "creadoEn" ASC
    `, [empresaId]);

    const precio = Number(sus.precio ?? 0);
    const resultado = imputarPago({
      monto:            redondearMoneda(Number(monto ?? 0)),
      abonoDisponible:  Number(sus.abonoDisponible ?? 0),
      cargosPendientes: cargosPendientes.map((c: any) => ({
        id:             c.id,
        concepto:       c.concepto,
        saldoPendiente: redondearMoneda(Number(c.monto) - Number(c.montoPagado)),
      })),
      precioMensual:    precio,
      venceSuscripcion: sus.fechaVencimiento,
      diaCorte:         Number(sus.diaCorte),
      modalidad:        sus.modalidad ?? 'mensual',
      override:         override ?? null,
    });

    return { sus, precio, resultado };
  }

  /**
   * Persiste el resultado de calcularImputacion: liquida los cargos tocados,
   * y actualiza el abono y (si avanzó algún período) la fecha/estado de la
   * suscripción. Común a registrarPago y confirmarTransferencia — los dos
   * caminos que confirman dinero real contra la cuenta de una empresa.
   */
  private async aplicarResultadoImputacion(
    manager: EntityManager,
    empresaId: number,
    sus: any | null,
    resultado: ResultadoImputacion,
  ): Promise<void> {
    for (const c of resultado.cargosLiquidados) {
      await manager.query(`
        UPDATE pagos_suscripcion
        SET "montoPagado" = "montoPagado" + $1
        WHERE id = $2
      `, [c.montoAplicado, c.cargoId]);
    }

    if (!sus) return;

    if (resultado.periodos >= 1 && resultado.nuevaFecha) {
      await manager.query(`
        UPDATE suscripciones
        SET estado = 'activa',
            "fechaVencimiento" = $1,
            "motivoSuspension" = NULL,
            "enPeriodoGracia" = false,
            "abonoDisponible" = $2
        WHERE "empresaId" = $3
      `, [resultado.nuevaFecha, resultado.abonoFinal, empresaId]);
    } else {
      await manager.query(`
        UPDATE suscripciones
        SET "abonoDisponible" = $1
        WHERE "empresaId" = $2
      `, [resultado.abonoFinal, empresaId]);
    }
  }

  /**
   * Qué haría este pago: cargos que liquida, períodos que cubre y vencimiento
   * resultante.
   *
   * Lo llama el panel de cobros mientras el admin teclea el monto, para que el
   * aviso que lee ANTES de registrar salga de la misma fórmula que se aplica
   * DESPUÉS — una sola fuente de verdad, ver imputacion-pago.util.ts.
   */
  async previewPago(
    empresaId: number,
    monto: number,
    override?: OverrideImputacion,
  ): Promise<ResultadoImputacion & { sinSuscripcion: boolean }> {
    const { sus, resultado } = await this.calcularImputacion(empresaId, monto, override);
    return { sinSuscripcion: !sus, ...resultado };
  }

  async registrarPago(empresaId: number, dto: RegistrarPagoDto, adminId: number) {
    const { saved, sus, precio, resultado } = await this.ds.transaction(async (manager) => {
      // ── 1. Imputación: cargos pendientes → períodos → abono ───────────────
      const { sus, precio, resultado } = await this.calcularImputacion(
        empresaId, dto.monto, dto.override, manager,
      );

      if (resultado.sinPrecio) {
        throw new BadRequestException(
          `El plan "${sus?.plan ?? 'desconocido'}" no tiene precio configurado`,
        );
      }

      // ── 2. Período que cubre el pago, si el dto no lo trae ─────────────────
      let periodoInicio = dto.periodoInicio ? new Date(dto.periodoInicio) : null;
      let periodoFin    = dto.periodoFin    ? new Date(dto.periodoFin)    : null;

      if (sus && resultado.nuevaFecha) {
        const fechaStr = fechaDeVencimiento(sus.fechaVencimiento);
        if (!periodoInicio) periodoInicio = new Date(fechaStr + 'T00:00:00');
        if (!periodoFin)    periodoFin    = new Date(resultado.nuevaFecha + 'T00:00:00');
      }

      // ── 3. Registrar el pago ────────────────────────────────────────────────
      const pagoRepo = manager.getRepository(PagoSuscripcion);
      const pago = pagoRepo.create({
        empresaId,
        tipo:          dto.tipo,
        concepto:      dto.concepto,
        monto:         dto.monto,
        estado:        EstadoPago.CONFIRMADO,
        referencia:    dto.referencia ?? null,
        notas:         dto.notas ?? null,
        registradoPor: adminId,
        confirmadoPor: adminId,
        confirmadoEn:  new Date(),
        periodoInicio,
        periodoFin,
      });
      const saved = await pagoRepo.save(pago);

      // ── 4. Liquidar cargos + avanzar vencimiento/abono ──────────────────────
      await this.aplicarResultadoImputacion(manager, empresaId, sus, resultado);

      this.logger.log(
        `[PAGO] Empresa #${empresaId} | Admin #${adminId} | RD$${dto.monto} (${dto.tipo}) | ` +
        `Cargos liquidados: ${resultado.cargosLiquidados.length} (RD$${resultado.montoACargos}) | ` +
        `${resultado.periodos}×${sus?.modalidad ?? 'mensual'} (RD$${resultado.montoAPeriodos}) | ` +
        `Abono final: RD$${resultado.abonoFinal} | ` +
        `Vencimiento: ${sus ? fechaDeVencimiento(sus.fechaVencimiento) : '—'} → ${resultado.nuevaFecha ?? '(sin cambio)'}`,
      );

      return { saved, sus, precio, resultado };
    });

    // ── 5. Notificar a la empresa (fuera de la transacción) ─────────────────
    await this.notificarEmpresaPago(empresaId, saved).catch(e =>
      this.logger.warn(`Email pago registrado: ${e?.message}`)
    );

    return {
      ...saved,
      monto:   Number(saved.monto),
      precio,
      // Desglose real de la imputación — lo consume el recuadro verde del
      // frontend en vez de recalcular nada por su cuenta.
      imputacion: resultado,
      // Compat con lo que el frontend/otros consumidores ya leían:
      periodos:              resultado.periodos,
      nuevaFechaVencimiento: resultado.nuevaFecha,
    };
  }

  async confirmarTransferencia(pagoId: number, adminId: number, dto: ConfirmarPagoDto) {
    const pago = await this.pagoRepo.findOne({ where: { id: pagoId } });
    if (!pago) throw new NotFoundException(`Pago #${pagoId} no encontrado`);
    if (pago.tipo !== TipoPago.TRANSFERENCIA)
      throw new BadRequestException('Solo se pueden confirmar transferencias');
    if (pago.estado === EstadoPago.CONFIRMADO)
      throw new BadRequestException('Este pago ya fue confirmado');

    const resultado = await this.ds.transaction(async (manager) => {
      // ── Imputación: misma fórmula que el preview que el admin acaba de leer ──
      const { sus, resultado } = await this.calcularImputacion(
        pago.empresaId, Number(pago.monto), null, manager,
      );

      if (resultado.sinPrecio) {
        throw new BadRequestException(
          `El plan "${sus?.plan ?? 'desconocido'}" no tiene precio configurado`,
        );
      }

      // ── Confirmar el pago ────────────────────────────────────────────────────
      await manager.getRepository(PagoSuscripcion).update(pagoId, {
        estado:        EstadoPago.CONFIRMADO,
        confirmadoPor: adminId,
        confirmadoEn:  new Date(),
        notas:         dto.notas ?? pago.notas,
      });

      // ── Liquidar cargos + avanzar vencimiento/abono ──────────────────────────
      await this.aplicarResultadoImputacion(manager, pago.empresaId, sus, resultado);

      this.logger.log(
        `[TRANSFERENCIA] Empresa #${pago.empresaId} | Admin #${adminId} | RD$${pago.monto} | ` +
        `Cargos liquidados: ${resultado.cargosLiquidados.length} (RD$${resultado.montoACargos}) | ` +
        `${resultado.periodos}×${sus?.modalidad ?? 'mensual'} (RD$${resultado.montoAPeriodos}) | ` +
        `Abono final: RD$${resultado.abonoFinal} | ` +
        `Vencimiento: ${sus ? fechaDeVencimiento(sus.fechaVencimiento) : '—'} → ${resultado.nuevaFecha ?? '(sin cambio)'}`,
      );

      return resultado;
    });

    const updated = await this.pagoRepo.findOne({ where: { id: pagoId } });
    await this.notificarEmpresaConfirmacion(pago.empresaId, updated!).catch(e =>
      this.logger.warn(`Email confirmación: ${e?.message}`)
    );

    this.logger.log(`Transferencia #${pagoId} confirmada por admin #${adminId}`);
    return { ...updated, imputacion: resultado };
  }

  async rechazarTransferencia(pagoId: number, adminId: number, dto: RechazarPagoDto) {
    const pago = await this.pagoRepo.findOne({ where: { id: pagoId } });
    if (!pago) throw new NotFoundException(`Pago #${pagoId} no encontrado`);
    if (pago.estado === EstadoPago.CONFIRMADO)
      throw new BadRequestException('No se puede rechazar un pago ya confirmado');

    await this.pagoRepo.update(pagoId, {
      estado:         EstadoPago.RECHAZADO,
      confirmadoPor:  adminId,
      confirmadoEn:   new Date(),
      motivoRechazo:  dto.motivoRechazo,
    });

    await this.notificarEmpresaRechazo(pago.empresaId, dto.motivoRechazo).catch(e =>
      this.logger.warn(`Email rechazo: ${e?.message}`)
    );

    this.logger.warn(`Transferencia #${pagoId} rechazada por admin #${adminId}: ${dto.motivoRechazo}`);
    return { ok: true };
  }

  /**
   * Crea un CARGO en la cuenta de una empresa.
   *
   * `manager` permite crearlo DENTRO de una transacción ajena, que es lo que
   * necesita el cargo por excedente de e-CF: el cargo y el sello del ciclo
   * tienen que ir juntos o no ir. Sin él habría que duplicar este INSERT, y
   * entonces habría dos sitios creando cargos que se separarían con el tiempo.
   */
  async agregarCargo(
    empresaId: number, dto: AgregarCargoDto, adminId: number, manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(PagoSuscripcion) : this.pagoRepo;
    const pago = repo.create({
      empresaId,
      tipo:          TipoPago.CARGO,
      concepto:      dto.concepto,
      monto:         dto.monto,
      estado:        EstadoPago.CONFIRMADO,
      notas:         dto.notas ?? null,
      registradoPor: adminId,
      confirmadoPor: adminId,
      confirmadoEn:  new Date(),
    });
    return repo.save(pago);
  }

  /**
   * Genera el cargo por el excedente de e-CF de un ciclo cerrado.
   *
   * Del cliente solo llega la empresa y el ciclo. El monto NO viaja en el body:
   * el servidor recuenta los comprobantes y relee el precio aquí mismo. El que
   * pulsa es el super admin y el que paga es otro; un monto que llegue de fuera
   * es un monto que alguien pudo teclear mal o manipular.
   *
   * Todo en UNA transacción: si el sello del ciclo falla, el cargo no queda. Un
   * cargo sin su recibo es un cobro que nadie sabe explicar, y uno duplicado es
   * el error caro de este módulo.
   */
  async generarCargoExcedenteEcf(empresaId: number, cicloInicio: string, adminId: number) {
    // Valida y recuenta ANTES de abrir la transacción: si el ciclo no se puede
    // cobrar, se sale con el motivo exacto sin haber tocado nada.
    const d = await this.cuotaEcf.datosParaCargo(empresaId, cicloInicio);

    const concepto =
      `Excedente de e-CF — ciclo ${fechaISOaDO(d.ciclo.inicio)} al ${fechaISOaDO(finInclusivo(d.ciclo.fin))}\n` +
      `${d.emitidos.toLocaleString('es-DO')} emitidos, cupo ${d.planNombre} ` +
      `${d.cupo.toLocaleString('es-DO')} → ${d.excedente.toLocaleString('es-DO')} excedentes ` +
      `× RD$${d.precioUnitario.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

    const pago = await this.ds.transaction(async (manager) => {
      const creado = await this.agregarCargo(
        empresaId, { concepto, monto: d.monto }, adminId, manager,
      );
      await this.cuotaEcf.sellarCargo(manager, empresaId, d, creado.id, adminId);
      return creado;
    });

    this.logger.warn(
      `[cuota-ecf] cargo #${pago.id} por excedente: empresa #${empresaId}, ` +
      `ciclo ${d.ciclo.inicio}, ${d.excedente} × RD$${d.precioUnitario} = RD$${d.monto} ` +
      `(super admin #${adminId})`,
    );

    return { ...pago, detalle: d };
  }

  /**
   * Aplica un crédito contra un CARGO específico (`dto.cargoId`) o, si no
   * viene, directo al abono general (`suscripciones.abonoDisponible`).
   *
   * Si el crédito es mayor que el saldo del cargo, el excedente va al abono
   * general — nunca se pierde, igual que el remanente de un pago (ver
   * imputacion-pago.util.ts).
   */
  async aplicarCredito(empresaId: number, dto: AplicarCreditoDto, adminId: number) {
    return this.ds.transaction(async (manager) => {
      const pagoRepo = manager.getRepository(PagoSuscripcion);
      const pago = pagoRepo.create({
        empresaId,
        tipo:          TipoPago.CREDITO,
        concepto:      dto.concepto,
        monto:         dto.monto,
        estado:        EstadoPago.CONFIRMADO,
        notas:         dto.notas ?? null,
        registradoPor: adminId,
        confirmadoPor: adminId,
        confirmadoEn:  new Date(),
      });
      const saved = await pagoRepo.save(pago);

      let montoRestante = redondearMoneda(Number(dto.monto));

      if (dto.cargoId) {
        const [cargo] = await manager.query(`
          SELECT id, monto, "montoPagado" FROM pagos_suscripcion
          WHERE id = $1 AND "empresaId" = $2 AND tipo = 'CARGO'
        `, [dto.cargoId, empresaId]);
        if (!cargo) throw new NotFoundException(`Cargo #${dto.cargoId} no encontrado`);

        const saldo   = Math.max(0, redondearMoneda(Number(cargo.monto) - Number(cargo.montoPagado)));
        const aplicar  = redondearMoneda(Math.min(montoRestante, saldo));
        if (aplicar > 0) {
          await manager.query(`
            UPDATE pagos_suscripcion SET "montoPagado" = "montoPagado" + $1 WHERE id = $2
          `, [aplicar, dto.cargoId]);
          montoRestante = redondearMoneda(montoRestante - aplicar);
        }
      }

      if (montoRestante > 0) {
        await manager.query(`
          UPDATE suscripciones
          SET "abonoDisponible" = "abonoDisponible" + $1
          WHERE "empresaId" = $2
        `, [montoRestante, empresaId]);
      }

      return saved;
    });
  }

  async enviarRecordatorio(empresaId: number) {
    const [sus] = await this.ds.query<any[]>(`
      SELECT s.*, e.nombre, e.email FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s."empresaId" = $1
    `, [empresaId]);
    if (!sus) throw new NotFoundException('Empresa no encontrada');

    const fechaEfectivaRec = sus.estado === 'prueba'
      ? (sus.fechaFinPrueba ?? sus.fechaVencimiento)
      : sus.fechaVencimiento;
    await this.enviarEmailRecordatorio(
      sus.email, sus.nombre, sus.plan,
      Math.ceil((new Date(fechaEfectivaRec).getTime() - Date.now()) / 86400000),
    );
    return { ok: true, mensaje: `Recordatorio enviado a ${sus.email}` };
  }

  async updateConfiguracionBancaria(dto: UpdateConfiguracionBancariaDto) {
    let cfg = await this.bancoRepo.findOne({ where: { activo: true }, order: { id: 'DESC' } });
    if (cfg) {
      Object.assign(cfg, dto);
      return this.bancoRepo.save(cfg);
    } else {
      return this.bancoRepo.save(this.bancoRepo.create({ ...dto, activo: true }));
    }
  }

  async getHistorialEmpresa(empresaId: number) {
    const rows = await this.pagoRepo.find({ where: { empresaId }, order: { creadoEn: 'DESC' } });
    // montoPagado solo tiene sentido en filas tipo=CARGO — lo usa el selector
    // de "Crédito dirigido a un cargo" del panel (saldoPendiente = monto - montoPagado).
    return rows.map(r => ({ ...r, monto: Number(r.monto ?? 0), montoPagado: Number(r.montoPagado ?? 0) }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRONS — Alertas de vencimiento de suscripción pagada
  // ──────────────────────────────────────────────────────────────────────────

  /** 9:00 AM hora RD (13:00 UTC) — alertas 7d y 3d antes del vencimiento */
  @Cron('0 13 * * *')
  async enviarAlertasVencimiento() {
    const hoy = new Date();

    for (const dias of [7, 3, 1]) {
      const target = new Date(hoy);
      target.setDate(target.getDate() + dias);
      const fecha = target.toISOString().split('T')[0];

      const empresas = await this.ds.query<any[]>(`
        SELECT s."empresaId", s.plan, s."fechaVencimiento",
               e.nombre, e.email
        FROM suscripciones s
        JOIN empresa e ON e.id = s."empresaId"
        WHERE s.estado = 'activa'
          AND s."fechaVencimiento"::date = $1
          AND e."isActive" = true
      `, [fecha]);

      for (const emp of empresas) {
        await this.enviarEmailRecordatorio(emp.email, emp.nombre, emp.plan, dias)
          .catch(e => this.logger.warn(`Alerta ${dias}d empresa #${emp.empresaId}: ${e?.message}`));
        this.logger.log(`Alerta ${dias}d enviada a empresa #${emp.empresaId}`);
      }
    }
  }

  /** 00:30 UTC — suspender automáticamente cuando vence el período de gracia sin pago */
  @Cron('30 0 * * *')
  async suspenderPorFaltaDePago() {
    const hoy = new Date();
    const fecha = hoy.toISOString().split('T')[0];

    // Buscar suscripciones en período de gracia cuya fechaFinGracia ya pasó
    const empresas = await this.ds.query<any[]>(`
      SELECT s."empresaId", s.plan, e.nombre, e.email
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s."enPeriodoGracia" = true
        AND s."fechaFinGracia"::date <= $1
        AND e."isActive" = true
    `, [fecha]);

    for (const emp of empresas) {
      // Verificar si tiene pago confirmado después del vencimiento original
      const [pago] = await this.ds.query<any[]>(`
        SELECT id FROM pagos_suscripcion
        WHERE "empresaId" = $1
          AND estado = 'CONFIRMADO'
          AND "confirmadoEn" > (
            SELECT "fechaVencimiento" FROM suscripciones WHERE "empresaId" = $1
          )
        LIMIT 1
      `, [emp.empresaId]);

      if (!pago) {
        await this.ds.query(`
          UPDATE suscripciones
          SET estado = 'suspendida',
              "enPeriodoGracia" = false,
              "motivoSuspension" = 'SUSPENSION_AUTOMATICA_PAGO'
          WHERE "empresaId" = $1 AND "enPeriodoGracia" = true
        `, [emp.empresaId]);

        await this.enviarEmailSuspension(emp.email, emp.nombre, emp.plan)
          .catch(e => this.logger.warn(`Email suspensión empresa #${emp.empresaId}: ${e?.message}`));

        this.logger.warn(`Empresa #${emp.empresaId} suspendida (gracia vencida, sin pago)`);
      }
    }
  }

  /** 8:00 AM UTC — resumen diario de cobros al super admin */
  @Cron('0 8 * * 1-5') // Lunes a viernes
  async resumenDiarioSuperAdmin() {
    const pendientes = await this.listarComprobantesPeridentes();
    const vencenHoy  = await this.ds.query<any[]>(`
      SELECT e.nombre, e.email, s.plan
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s."fechaVencimiento"::date = CURRENT_DATE
        AND s.estado = 'activa'
        AND e."isActive" = true
    `);

    if (pendientes.length === 0 && vencenHoy.length === 0) return;

    const adminEmail = process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@hicloudrd.com';
    const html = this.buildResumenHtml(pendientes, vencenHoy);

    await this.emailSvc.enviar({
      to:      adminEmail,
      subject: `📊 HiCloud — Resumen cobros del día (${fechaTextoRD()})`,
      html,
    }).catch(e => this.logger.warn(`Resumen diario: ${e?.message}`));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers de email
  // ──────────────────────────────────────────────────────────────────────────

  private async enviarEmailRecordatorio(
    email: string, nombre: string, plan: string, dias: number,
  ) {
    const urgencia = dias <= 1 ? '🚨' : dias <= 3 ? '⚠️' : '📅';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,${dias <= 3 ? '#ef4444,#dc2626' : '#f59e0b,#d97706'});padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">${urgencia} Vencimiento de suscripción</h2></div>
  <div class="body">
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Tu suscripción al plan <strong>${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong> vence en <strong>${dias === 1 ? '1 día' : `${dias} días`}</strong>.</p>
    <p>Para evitar la suspensión de tu cuenta, realiza tu pago a tiempo.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com'}/configuracion" class="btn">Pagar ahora →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">¿Tienes preguntas? Escríbenos a soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;

    await this.emailSvc.enviar({
      to:      email,
      subject: `${urgencia} Tu suscripción HiCloud vence en ${dias} ${dias === 1 ? 'día' : 'días'}`,
      html,
    });
  }

  private async enviarEmailSuspension(email: string, nombre: string, plan: string) {
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#ef4444,#dc2626);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">🔒 Cuenta suspendida</h2></div>
  <div class="body">
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Tu cuenta en HiCloud ERP ha sido <strong>suspendida</strong> por falta de pago del plan <strong>${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong>.</p>
    <p>Para reactivar tu cuenta, realiza el pago y sube el comprobante desde el panel:</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontendUrl}/configuracion" class="btn">Reactivar cuenta →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">¿Necesitas ayuda? soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;
    await this.emailSvc.enviar({ to: email, subject: '🔒 Tu cuenta HiCloud fue suspendida — actúa ahora', html });
  }

  private async notificarSuperAdminComprobante(pago: PagoSuscripcion, empresaId: number) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    const adminEmail = process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@hicloudrd.com';
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

    await this.emailSvc.enviar({
      to:      adminEmail,
      subject: `💳 HiCloud — Nuevo comprobante de pago de ${emp?.nombre ?? `Empresa #${empresaId}`}`,
      html:    `<p><strong>${emp?.nombre}</strong> subió un comprobante de transferencia por <strong>RD$${Number(pago.monto).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>.</p>
               <p><a href="${frontendUrl}/super-admin">Ver en el panel →</a></p>`,
    });
  }

  private async notificarEmpresaPago(empresaId: number, pago: PagoSuscripcion) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    if (!emp?.email) return;

    await this.emailSvc.enviar({
      to:      emp.email,
      subject: '✅ Pago registrado en HiCloud ERP',
      html:    `<p>Hola <strong>${emp.nombre}</strong>,</p>
               <p>Se ha registrado un pago de <strong>RD$${Number(pago.monto).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> — ${pago.concepto}.</p>
               <p>Gracias por tu pago.</p>`,
    });
  }

  private async notificarEmpresaConfirmacion(empresaId: number, pago: PagoSuscripcion) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    if (!emp?.email) return;

    await this.emailSvc.enviar({
      to:      emp.email,
      subject: '✅ Transferencia confirmada — HiCloud ERP',
      html:    `<p>Hola <strong>${emp.nombre}</strong>,</p>
               <p>Tu transferencia de <strong>RD$${Number(pago.monto).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> fue <strong>confirmada</strong>. Tu suscripción está activa.</p>`,
    });
  }

  private async notificarEmpresaRechazo(empresaId: number, motivo: string) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    if (!emp?.email) return;

    await this.emailSvc.enviar({
      to:      emp.email,
      subject: '❌ Comprobante rechazado — HiCloud ERP',
      html:    `<p>Hola <strong>${emp.nombre}</strong>,</p>
               <p>Tu comprobante de transferencia fue <strong>rechazado</strong>.</p>
               <p><strong>Motivo:</strong> ${motivo}</p>
               <p>Por favor intenta nuevamente con un comprobante válido.</p>`,
    });
  }

  private buildResumenHtml(pendientes: any[], vencenHoy: any[]): string {
    const pRows = pendientes.map(p =>
      `<tr><td>${p.empresaNombre}</td><td>RD$${Number(p.monto).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${new Date(p.creadoEn).toLocaleDateString('es-DO')}</td></tr>`
    ).join('');
    const vRows = vencenHoy.map(v =>
      `<tr><td>${v.nombre}</td><td>${v.plan}</td><td>${v.email}</td></tr>`
    ).join('');

    return `<h2>Resumen de cobros — ${fechaTextoRD()}</h2>
    ${pendientes.length > 0 ? `<h3>Comprobantes pendientes (${pendientes.length})</h3>
    <table border="1" cellpadding="6"><tr><th>Empresa</th><th>Monto</th><th>Fecha</th></tr>${pRows}</table>` : '<p>Sin comprobantes pendientes.</p>'}
    ${vencenHoy.length > 0 ? `<h3>Vencen hoy (${vencenHoy.length})</h3>
    <table border="1" cellpadding="6"><tr><th>Empresa</th><th>Plan</th><th>Email</th></tr>${vRows}</table>` : ''}`;
  }
}
