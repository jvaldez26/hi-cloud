import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum PlanTipo {
  TRIAL        = 'trial',
  EMPRENDEDOR  = 'emprendedor',
  PYME         = 'pyme',
  PRO          = 'pro',
  PLUS         = 'plus',
  // Legado — mantenidos durante migración
  BASICO       = 'basico',
  PROFESIONAL  = 'profesional',
  EMPRESARIAL  = 'empresarial',
  ENTERPRISE   = 'enterprise',
}

export enum SuscripcionEstado {
  ACTIVA     = 'activa',
  VENCIDA    = 'vencida',
  SUSPENDIDA = 'suspendida',
  CANCELADA  = 'cancelada',
}

export enum ModalidadPago {
  MENSUAL = 'mensual',
  ANUAL   = 'anual',
}

export interface PlanConfig {
  nombre:                     string;
  precioMensualUsd:           number;
  precioAnualUsd:             number;
  limiteIngresosMensualesDop: number;
  limiteUsuarios:             number;
  diasPrueba:                 number;
  precio:          number;
  maxUsuarios:     number;
  maxFacturasMes:  number;
  maxProductos:    number;
  maxClientes:     number;
  maxSucursales:   number;
  modulos:         string[];
  soporte:         string;
}

const R = 58.5;

export const PLANES: Record<PlanTipo, PlanConfig> = {
  [PlanTipo.TRIAL]:       { nombre: 'Trial',        precioMensualUsd: 0,   precioAnualUsd: 0,       limiteIngresosMensualesDop: 500_000,   limiteUsuarios: -1, diasPrueba: 15, precio: 0,              maxUsuarios: -1, maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.EMPRENDEDOR]: { nombre: 'Emprendedor',   precioMensualUsd: 29,  precioAnualUsd: 313.20,  limiteIngresosMensualesDop: 125_000,   limiteUsuarios: 1,  diasPrueba: 0,  precio: Math.round(29*R), maxUsuarios: 1,  maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.PYME]:        { nombre: 'Pyme',          precioMensualUsd: 59,  precioAnualUsd: 637.20,  limiteIngresosMensualesDop: 500_000,   limiteUsuarios: 2,  diasPrueba: 0,  precio: Math.round(59*R), maxUsuarios: 2,  maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.PRO]:         { nombre: 'Pro',           precioMensualUsd: 89,  precioAnualUsd: 961.20,  limiteIngresosMensualesDop: 1_250_000, limiteUsuarios: 3,  diasPrueba: 0,  precio: Math.round(89*R), maxUsuarios: 3,  maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.PLUS]:        { nombre: 'Plus',          precioMensualUsd: 129, precioAnualUsd: 1393.20, limiteIngresosMensualesDop: 6_250_000, limiteUsuarios: 8,  diasPrueba: 0,  precio: Math.round(129*R),maxUsuarios: 8,  maxFacturasMes: -1, maxProductos: -1, maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
  [PlanTipo.BASICO]:      { nombre: 'Básico',        precioMensualUsd: 0,   precioAnualUsd: 0,       limiteIngresosMensualesDop: 125_000,   limiteUsuarios: 3,  diasPrueba: 0,  precio: 1500,            maxUsuarios: 3,  maxFacturasMes: 200,  maxProductos: 100, maxClientes: 100, maxSucursales: 1,  modulos: ['*'], soporte: 'Email' },
  [PlanTipo.PROFESIONAL]: { nombre: 'Profesional',   precioMensualUsd: 0,   precioAnualUsd: 0,       limiteIngresosMensualesDop: 500_000,   limiteUsuarios: 10, diasPrueba: 0,  precio: 3500,            maxUsuarios: 10, maxFacturasMes: 1000, maxProductos: 500, maxClientes: 500, maxSucursales: 3,  modulos: ['*'], soporte: 'Chat' },
  [PlanTipo.EMPRESARIAL]: { nombre: 'Empresarial',   precioMensualUsd: 0,   precioAnualUsd: 0,       limiteIngresosMensualesDop: 1_250_000, limiteUsuarios: 25, diasPrueba: 0,  precio: 7000,            maxUsuarios: 25, maxFacturasMes: 5000, maxProductos: 2000,maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: 'Tel' },
  [PlanTipo.ENTERPRISE]:  { nombre: 'Enterprise',    precioMensualUsd: 0,   precioAnualUsd: 0,       limiteIngresosMensualesDop: -1,        limiteUsuarios: -1, diasPrueba: 0,  precio: 15000,           maxUsuarios: -1, maxFacturasMes: -1,   maxProductos: -1,  maxClientes: -1, maxSucursales: -1, modulos: ['*'], soporte: '24/7' },
};

export function planPorIngresos(avgDop: number): PlanTipo {
  if (avgDop <= 125_000)   return PlanTipo.EMPRENDEDOR;
  if (avgDop <= 500_000)   return PlanTipo.PYME;
  if (avgDop <= 1_250_000) return PlanTipo.PRO;
  return PlanTipo.PLUS;
}

export const PLAN_TIER: Record<PlanTipo, number> = {
  [PlanTipo.TRIAL]: 0,
  [PlanTipo.EMPRENDEDOR]: 1, [PlanTipo.BASICO]: 1,
  [PlanTipo.PYME]: 2,        [PlanTipo.PROFESIONAL]: 2,
  [PlanTipo.PRO]: 3,         [PlanTipo.EMPRESARIAL]: 3,
  [PlanTipo.PLUS]: 4,        [PlanTipo.ENTERPRISE]: 4,
};

export const PLAN_LIMITES = Object.fromEntries(
  Object.entries(PLANES).map(([k, v]) => [k, {
    usuarios: v.maxUsuarios, facturasMes: v.maxFacturasMes,
    precio: v.precio, nombre: v.nombre, features: v.modulos,
  }]),
) as Record<PlanTipo, { usuarios: number; facturasMes: number; precio: number; nombre: string; features: string[] }>;

export const RUTA_MODULO: Record<string, { modulo: string; label: string; planMinimo: PlanTipo }> = {};

export function planTieneModulo(_plan: PlanTipo, _modulo: string): boolean {
  return true;
}

@Entity('suscripciones')
export class Suscripcion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ type: 'enum', enum: PlanTipo, default: PlanTipo.TRIAL })
  plan!: PlanTipo;

  @Column({ type: 'enum', enum: SuscripcionEstado, default: SuscripcionEstado.ACTIVA })
  estado!: SuscripcionEstado;

  @Column({ type: 'enum', enum: ModalidadPago, default: ModalidadPago.MENSUAL })
  modalidad!: ModalidadPago;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaVencimiento!: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  ingresosMesActualDop!: number;

  @Column({ length: 7, nullable: true })
  mesPeriodo?: string;

  @Column({ default: false })
  enPeriodoGracia!: boolean;

  @Column({ type: 'date', nullable: true })
  fechaFinGracia?: Date;

  @Column({ type: 'text', nullable: true })
  motivoSuspension?: string;

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
