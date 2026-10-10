import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoCierre {
  ABIERTA        = 'abierta',
  CERRADA        = 'cerrada',
  REVISADA       = 'revisada',
  /** Cierre administrativo sin cuadre: se usa para depurar cajas huérfanas
   *  (abiertas y nunca cerradas). No implica diferencia ni faltante del cajero.
   *  Excluida de los reportes de descuadre. */
  CERRADA_SISTEMA = 'cerrada_por_sistema',
}

@TenantScoped()
@Entity('cierres_caja')
@Unique('UQ_caja_fecha_vendedor', ['fecha', 'vendedorId'])
export class CierreCaja {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'int', nullable: true })
  vendedorId?: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  vendedorNombre?: string;

  @Column({ type: 'int', nullable: true })
  sucursalId?: number;

  @Column({ type: 'enum', enum: EstadoCierre, default: EstadoCierre.ABIERTA })
  estado!: EstadoCierre;

  // Apertura
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  saldoApertura!: number;

  // Ingresos del día
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasEfectivo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasTarjeta!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasTransferencia!: number;

  // Facturas emitidas con tipoPago=CREDITO (notas LIKE '%crédito%') — no afectan efectivo en caja
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasCredito!: number;

  /** Total de cobros del turno, TODOS los métodos. Informativo. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cobrosRecibidos!: number;

  /** Parte de `cobrosRecibidos` recibida en efectivo — la única que está en el cajón. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cobrosEfectivo!: number;

  /** Resto (transferencia, cheque, tarjeta, depósito). NO entra en el esperado. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cobrosOtrosMedios!: number;

  /** Total de anticipos del turno, TODOS los métodos. Informativo. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAnticipos!: number;

  /** Parte de `totalAnticipos` recibida en efectivo — sí está en el cajón. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  anticiposEfectivo!: number;

  /** Resto de anticipos. NO entra en el esperado. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  anticiposOtrosMedios!: number;

  // Egresos
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  gastosEfectivo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  retiros!: number;

  // Cierre
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  saldoCierre!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  saldoFisico!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  diferencia!: number;

  // ── Trazabilidad ──────────────────────────────────────────────────────────

  /**
   * Con qué fórmula se calculó `saldoCierre`. Hace el cierre auto-descriptivo:
   * no hay que deducir por la fecha si dos cierres son comparables.
   *
   *   0 = SIN CALCULAR. Nadie cuadró esta caja: sus importes son 0 porque no se
   *       calcularon, no porque una fórmula diera 0. Es el caso del cierre por
   *       sistema al desactivar el control de caja (configuracion.service).
   *
   *   1 = fórmula original — sumaba TODOS los cobros (también transferencia y
   *       cheque) y no contaba los anticipos en efectivo. Estos SÍ son cierres
   *       afectados por el bug de la fórmula.
   *
   *   2 = solo efectivo en el cajón (ver efectivo-esperado.util.ts).
   *
   * La distinción entre 0 y 1 no es cosmética: una consulta que busque cierres
   * afectados por la fórmula vieja debe encontrar los de la 1 y NO los de la 0,
   * que nunca pasaron por ninguna fórmula. Con ambos en 1, el alcance del
   * problema saldría inflado justo cuando hay que decidir qué hacer con él.
   *
   * Los cierres anteriores al cambio quedan en 1 por el default y NO se
   * recalculan. Los `cerrada_por_sistema` ya existentes también quedan en 1: no
   * se tocan, pero se distinguen por su `estado`.
   */
  @Column({ type: 'int', default: 1 })
  formulaVersion!: number;

  /**
   * Valores del PRIMER cierre, guardados al reabrirlo.
   *
   * Reabrir ponía saldoCierre/saldoFisico/diferencia a 0: los números con los
   * que se cuadró dinero real desaparecían sin dejar rastro. Ahora se conservan.
   *
   * NULL = nunca se recerró. Y una vez escritos NO se sobrescriben: el original
   * es el primero, no el anterior.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  esperadoOriginal?: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  contadoOriginal?: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  diferenciaOriginal?: number | null;

  /** Con qué fórmula se calculó `esperadoOriginal`. */
  @Column({ type: 'int', nullable: true })
  formulaVersionOriginal?: number | null;

  /**
   * Cuadre por forma de pago del PRIMER cierre, guardado al reabrirlo —
   * mismo criterio que esperadoOriginal: sin esto, el recierre sobrescribe
   * cuadrePorFormaPago/facturasSinFormaPago/sospechasFormaPago sin dejar
   * rastro de lo que el primer cajero declaró por cada forma. NULL = nunca
   * se recerró. Solo se escribe una vez — el original es el PRIMERO.
   */
  @Column({ type: 'jsonb', nullable: true })
  cuadrePorFormaPagoOriginal?: { forma: string; esperado: number; declarado: number; diferencia: number }[] | null;

  @Column({ type: 'jsonb', nullable: true })
  facturasSinFormaPagoOriginal?: { id: number; folio: string; total: number; clienteNombre?: string }[] | null;

  @Column({ type: 'jsonb', nullable: true })
  sospechasFormaPagoOriginal?: {
    formaSobrante: string; formaFaltante: string; monto: number;
    facturasCandidatas: { id: number; folio: string; total: number; formasPago: { tipo: number; monto: number }[] }[];
  }[] | null;

  /** Quién reabrió y cuándo — del usuario autenticado, nunca del body. */
  @Column({ type: 'int', nullable: true })
  reabiertoPorUsuarioId?: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reabiertoPorNombre?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reabiertoEn?: Date | null;

  @Column({ type: 'int', default: 0 })
  cantidadTransacciones!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  // Desglose de billetes y método de pago al cierre (enviado por el POS)
  @Column({ type: 'jsonb', nullable: true })
  desgloseBilletes?: Record<string, number>;

  @Column({ type: 'jsonb', nullable: true })
  desglosePago?: Record<string, string>;

  /**
   * Cuadre por forma de pago — ver cuadre-por-forma-pago.util.ts. Snapshot
   * calculado AL CERRAR (una fila por forma: {forma, esperado, declarado,
   * diferencia}), nunca recalculado después — una corrección posterior a
   * una factura del turno queda en `ajustes_cierre_caja`, no reescribe esto.
   */
  @Column({ type: 'jsonb', nullable: true })
  cuadrePorFormaPago?: { forma: string; esperado: number; declarado: number; diferencia: number }[];

  /** Facturas CONTADO del turno sin forma de pago (o que no cubre el total) — fuera del cuadre, se muestran aparte. */
  @Column({ type: 'jsonb', nullable: true })
  facturasSinFormaPago?: { id: number; folio: string; total: number; clienteNombre?: string }[];

  /**
   * Sobrante de una forma ≈ faltante de otra → probable forma mal registrada
   * (ver cuadre-por-forma-pago.util.ts), con las facturas del turno que
   * podrían explicarlo (pago mixto con ambas formas en juego).
   */
  @Column({ type: 'jsonb', nullable: true })
  sospechasFormaPago?: {
    formaSobrante: string; formaFaltante: string; monto: number;
    facturasCandidatas: { id: number; folio: string; total: number; formasPago: { tipo: number; monto: number }[] }[];
  }[];

  @Column()
  userId!: number;

  @Column({ nullable: true })
  empresaId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
