import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum PlanTipo {
  EMPRENDEDOR = 'emprendedor',
  PYME        = 'pyme',
  PRO         = 'pro',
  PLUS        = 'plus',
  // Legado — solo para datos históricos, no se asignan a empresas nuevas
  TRIAL       = 'trial',
  BASICO      = 'basico',
  PROFESIONAL = 'profesional',
  EMPRESARIAL = 'empresarial',
  ENTERPRISE  = 'enterprise',
}

/** Planes activos que se ofrecen a nuevas empresas */
export const PLANES_ACTIVOS: PlanTipo[] = [
  PlanTipo.EMPRENDEDOR, PlanTipo.PYME, PlanTipo.PRO, PlanTipo.PLUS,
];

export enum SuscripcionEstado {
  PRUEBA     = 'prueba',     // Período gratuito de 15 días del plan elegido
  ACTIVA     = 'activa',     // Plan pagado y vigente
  VENCIDA    = 'vencida',    // Legado
  SUSPENDIDA = 'suspendida', // Suspendida manualmente o por vencimiento de prueba
  CANCELADA  = 'cancelada',
}

export enum ModalidadPago {
  MENSUAL = 'mensual',
  ANUAL   = 'anual',
}

export interface PlanConfig {
  nombre:                     string;
  limiteIngresosMensualesDop: number;
  limiteUsuarios:             number;
  /**
   * e-CF incluidos por CICLO de facturación (no por mes calendario — ver
   * `ciclo-facturacion.util.ts`). Pasarse NO bloquea la emisión: se cuenta, se
   * avisa, y el super admin decide si genera el cargo por el excedente.
   *
   * Es el único de los tres límites que mide al cliente que más factura: la
   * empresa 44 gasta el 47% de su cupo de ingresos y el 94% del de e-CF, y ya
   * está en el plan más alto — sin excedente no habría nada que cobrarle.
   */
  limiteEcfMensual:           number;
  diasPrueba:                 number;
  precio:                     number;
  maxUsuarios:                number;
  maxFacturasMes:             number;
  maxProductos:               number;
  maxClientes:                number;
  maxSucursales:              number;
  modulos:                    string[];
  soporte:                    string;
}

export const PLANES: Record<PlanTipo, PlanConfig> = {
  // ── Planes activos ─────────────────────────────────────────────────────────
  [PlanTipo.EMPRENDEDOR]: {
    nombre: 'Emprendedor',
    limiteIngresosMensualesDop: 125_000, limiteUsuarios: 2, limiteEcfMensual: 500,
    diasPrueba: 15, precio: 1700,
    maxUsuarios: 2, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1,
    modulos: ['*'], soporte: '24/7',
  },
  [PlanTipo.PYME]: {
    nombre: 'Pyme',
    limiteIngresosMensualesDop: 500_000, limiteUsuarios: 3, limiteEcfMensual: 1_000,
    diasPrueba: 15, precio: 3500,
    maxUsuarios: 3, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1,
    modulos: ['*'], soporte: '24/7',
  },
  [PlanTipo.PRO]: {
    nombre: 'Pro',
    limiteIngresosMensualesDop: 1_250_000, limiteUsuarios: 4, limiteEcfMensual: 2_500,
    diasPrueba: 15, precio: 5200,
    maxUsuarios: 4, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1,
    modulos: ['*'], soporte: '24/7',
  },
  [PlanTipo.PLUS]: {
    nombre: 'Plus',
    limiteIngresosMensualesDop: 6_250_000, limiteUsuarios: 10, limiteEcfMensual: 6_000,
    diasPrueba: 15, precio: 7600,
    maxUsuarios: 10, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1,
    modulos: ['*'], soporte: '24/7',
  },
  // ── Legado (mantenidos para datos históricos) ──────────────────────────────
  [PlanTipo.TRIAL]:       { nombre: 'Trial',       limiteIngresosMensualesDop: 500_000,   limiteUsuarios: -1, limiteEcfMensual: 500, diasPrueba: 15, precio: 0,     maxUsuarios: -1, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.BASICO]:      { nombre: 'Básico',       limiteIngresosMensualesDop: 125_000,   limiteUsuarios: 2,  limiteEcfMensual: 500, diasPrueba: 0,  precio: 1500,  maxUsuarios: 2,  maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.PROFESIONAL]: { nombre: 'Profesional',  limiteIngresosMensualesDop: 500_000,   limiteUsuarios: 3,  limiteEcfMensual: 1_000, diasPrueba: 0,  precio: 3500,  maxUsuarios: 3,  maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.EMPRESARIAL]: { nombre: 'Empresarial',  limiteIngresosMensualesDop: 1_250_000, limiteUsuarios: 10, limiteEcfMensual: 2_500, diasPrueba: 0,  precio: 7000,  maxUsuarios: 10, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.ENTERPRISE]:  { nombre: 'Enterprise',   limiteIngresosMensualesDop: -1,        limiteUsuarios: -1, limiteEcfMensual: 6_000, diasPrueba: 0,  precio: 15000, maxUsuarios: -1, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
};

export function planPorIngresos(avgDop: number): PlanTipo {
  if (avgDop <= 125_000)   return PlanTipo.EMPRENDEDOR;
  if (avgDop <= 500_000)   return PlanTipo.PYME;
  if (avgDop <= 1_250_000) return PlanTipo.PRO;
  return PlanTipo.PLUS;
}

export const PLAN_TIER: Record<PlanTipo, number> = {
  [PlanTipo.TRIAL]: 0,      [PlanTipo.BASICO]: 0,
  [PlanTipo.EMPRENDEDOR]: 1,
  [PlanTipo.PYME]: 2,       [PlanTipo.PROFESIONAL]: 2,
  [PlanTipo.PRO]: 3,        [PlanTipo.EMPRESARIAL]: 3,
  [PlanTipo.PLUS]: 4,       [PlanTipo.ENTERPRISE]: 4,
};

export const PLAN_LIMITES = Object.fromEntries(
  Object.entries(PLANES).map(([k, v]) => [k, {
    usuarios: v.maxUsuarios, facturasMes: v.maxFacturasMes,
    precio: v.precio, nombre: v.nombre, features: v.modulos,
  }]),
) as Record<PlanTipo, { usuarios: number; facturasMes: number; precio: number; nombre: string; features: string[] }>;

export const RUTA_MODULO: Record<string, { modulo: string; label: string; planMinimo: PlanTipo }> = {};

export function planTieneModulo(_plan: PlanTipo, _modulo: string): boolean {
  return true; // todos los planes incluyen todos los módulos
}

@Entity('suscripciones')
export class Suscripcion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ type: 'enum', enum: PlanTipo, default: PlanTipo.EMPRENDEDOR })
  plan!: PlanTipo;

  @Column({ type: 'enum', enum: SuscripcionEstado, default: SuscripcionEstado.PRUEBA })
  estado!: SuscripcionEstado;

  // varchar — la BD no tiene suscripciones_modalidad_enum, es character varying
  @Column({ length: 10, default: ModalidadPago.MENSUAL })
  modalidad!: ModalidadPago;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaVencimiento!: Date;

  @Column({ type: 'date', nullable: true })
  fechaFinPrueba?: Date;

  @Column({ default: false })
  recordatorio5dEnviado!: boolean;

  @Column({ default: false })
  recordatorio1dEnviado!: boolean;

  @Column({ length: 20, nullable: true })
  planElegidoEnRegistro?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  ingresosMesActualDop!: number;

  @Column({ length: 7, nullable: true })
  mesPeriodo?: string;

  @Column({ default: false })
  enPeriodoGracia!: boolean;

  @Column({ type: 'date', nullable: true })
  fechaFinGracia?: Date;

  @Column({ default: false })
  recordatorio1dGraciaEnviado!: boolean;

  @Column({ type: 'smallint' })
  diaCorte!: number;

  @Column({ type: 'text', nullable: true })
  motivoSuspension?: string;

  // ── Cancelación — detiene el devengo del cargo automático ────────────────
  // NOT NULL a nivel de aplicación (SuscripcionesService.cancelar lo exige);
  // no aquí, porque las filas existentes no tienen valor que darle.
  @Column({ type: 'text', nullable: true })
  motivoCancelacion?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  canceladaEn?: Date | null;

  /** userId del super admin que canceló — del CLS, nunca del body. */
  @Column({ type: 'int', nullable: true })
  canceladaPor?: number | null;

  @Column({ type: 'int', default: 0 })
  facturasMesUsadas!: number;

  @Column({ type: 'int', default: 0 })
  facturasMesReset!: number;

  @Column({ type: 'text', nullable: true })
  notasAdmin?: string;

  @Column({ nullable: true })
  asignadoA?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
