import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum PlanTipo {
  TRIAL       = 'trial',
  BASICO      = 'basico',
  PROFESIONAL = 'profesional',
  EMPRESARIAL = 'empresarial',
  ENTERPRISE  = 'enterprise',
}

export enum SuscripcionEstado {
  ACTIVA     = 'activa',
  VENCIDA    = 'vencida',
  SUSPENDIDA = 'suspendida',
  CANCELADA  = 'cancelada',
}

export interface PlanConfig {
  nombre:          string;
  precio:          number;   // RD$/mes (0 = gratis)
  diasPrueba:      number;
  maxUsuarios:     number;   // -1 = ilimitado
  maxFacturasMes:  number;   // -1 = ilimitado
  maxProductos:    number;   // -1 = ilimitado
  maxClientes:     number;   // -1 = ilimitado
  maxSucursales:   number;   // -1 = ilimitado
  modulos:         string[]; // ['*'] = todos
  soporte:         string;
}

// ── Configuración completa de planes ─────────────────────────────────────────
export const PLANES: Record<PlanTipo, PlanConfig> = {
  [PlanTipo.TRIAL]: {
    nombre:         'Trial',
    precio:         0,
    diasPrueba:     30,
    maxUsuarios:    2,
    maxFacturasMes: 50,
    maxProductos:   20,
    maxClientes:    20,
    maxSucursales:  1,
    modulos: [
      'dashboard', 'pos', 'facturas', 'clientes', 'productos', 'inventario',
      'caja', 'reportes_basicos',
    ],
    soporte: 'Documentación',
  },
  [PlanTipo.BASICO]: {
    nombre:         'Básico',
    precio:         1500,
    diasPrueba:     0,
    maxUsuarios:    3,
    maxFacturasMes: 200,
    maxProductos:   100,
    maxClientes:    100,
    maxSucursales:  1,
    modulos: [
      'dashboard', 'pos', 'facturas', 'clientes', 'productos', 'inventario',
      'caja', 'reportes_basicos',
      'ecf', 'compras', 'proveedores', 'reportes',
    ],
    soporte: 'Email',
  },
  [PlanTipo.PROFESIONAL]: {
    nombre:         'Profesional',
    precio:         3500,
    diasPrueba:     0,
    maxUsuarios:    10,
    maxFacturasMes: 1000,
    maxProductos:   500,
    maxClientes:    500,
    maxSucursales:  3,
    modulos: [
      'dashboard', 'pos', 'facturas', 'clientes', 'productos', 'inventario',
      'caja', 'reportes_basicos', 'ecf', 'compras', 'proveedores', 'reportes',
      'contabilidad', 'cxc', 'cxp', 'libro-mayor', 'activos-fijos',
      'presupuestos', 'sucursales', 'declaraciones', 'periodo-contable',
      'reportes-financieros', 'balance-comprobacion', 'libro-ventas',
    ],
    soporte: 'Email + Chat',
  },
  [PlanTipo.EMPRESARIAL]: {
    nombre:         'Empresarial',
    precio:         7000,
    diasPrueba:     0,
    maxUsuarios:    25,
    maxFacturasMes: 5000,
    maxProductos:   2000,
    maxClientes:    -1,
    maxSucursales:  -1,
    modulos: [
      'dashboard', 'pos', 'facturas', 'clientes', 'productos', 'inventario',
      'caja', 'reportes_basicos', 'ecf', 'compras', 'proveedores', 'reportes',
      'contabilidad', 'cxc', 'cxp', 'libro-mayor', 'activos-fijos',
      'presupuestos', 'sucursales', 'declaraciones', 'periodo-contable',
      'reportes-financieros', 'balance-comprobacion', 'libro-ventas',
      'nomina', 'vacaciones', 'evaluaciones', 'portal-empleado', 'capacitacion',
      'proyectos', 'crm', 'contratos', 'objetivos', 'licitaciones',
      'auditoria', 'kpi', 'analytics', 'mantenimiento', 'flota',
      'almacenes', 'manufactura', 'encuestas', 'comunicaciones',
    ],
    soporte: 'Email + Chat + Teléfono',
  },
  [PlanTipo.ENTERPRISE]: {
    nombre:         'Enterprise',
    precio:         15000,
    diasPrueba:     0,
    maxUsuarios:    -1,
    maxFacturasMes: -1,
    maxProductos:   -1,
    maxClientes:    -1,
    maxSucursales:  -1,
    modulos: ['*'],
    soporte: 'Dedicado 24/7',
  },
};

// Compat: mantener PLAN_LIMITES para código existente
export const PLAN_LIMITES = Object.fromEntries(
  Object.entries(PLANES).map(([k, v]) => [k, {
    usuarios:     v.maxUsuarios,
    facturasMes:  v.maxFacturasMes,
    precio:       v.precio,
    nombre:       v.nombre,
    features:     v.modulos,
  }]),
) as Record<PlanTipo, { usuarios: number; facturasMes: number; precio: number; nombre: string; features: string[] }>;

// ── Módulos bloqueados por ruta frontend ──────────────────────────────────────
export const RUTA_MODULO: Record<string, { modulo: string; label: string; planMinimo: PlanTipo }> = {
  '/ecf':                  { modulo: 'ecf',                 label: 'e-CF DGII',           planMinimo: PlanTipo.BASICO },
  '/compras':              { modulo: 'compras',              label: 'Compras',              planMinimo: PlanTipo.BASICO },
  '/compras/:id':          { modulo: 'compras',              label: 'Compras',              planMinimo: PlanTipo.BASICO },
  '/proveedores':          { modulo: 'proveedores',          label: 'Proveedores',          planMinimo: PlanTipo.BASICO },
  '/contabilidad':         { modulo: 'contabilidad',         label: 'Contabilidad',         planMinimo: PlanTipo.PROFESIONAL },
  '/cxc':                  { modulo: 'cxc',                  label: 'Cuentas por Cobrar',   planMinimo: PlanTipo.PROFESIONAL },
  '/cxp':                  { modulo: 'cxp',                  label: 'Cuentas por Pagar',    planMinimo: PlanTipo.PROFESIONAL },
  '/libro-mayor':          { modulo: 'libro-mayor',          label: 'Libro Mayor',          planMinimo: PlanTipo.PROFESIONAL },
  '/activos-fijos':        { modulo: 'activos-fijos',        label: 'Activos Fijos',        planMinimo: PlanTipo.PROFESIONAL },
  '/presupuestos':         { modulo: 'presupuestos',         label: 'Presupuestos',         planMinimo: PlanTipo.PROFESIONAL },
  '/sucursales':           { modulo: 'sucursales',           label: 'Multi-Sucursal',       planMinimo: PlanTipo.PROFESIONAL },
  '/declaraciones':        { modulo: 'declaraciones',        label: 'Declaraciones DGII',   planMinimo: PlanTipo.PROFESIONAL },
  '/periodo-contable':     { modulo: 'periodo-contable',     label: 'Período Contable',     planMinimo: PlanTipo.PROFESIONAL },
  '/reportes-financieros': { modulo: 'reportes-financieros', label: 'Reportes Financieros', planMinimo: PlanTipo.PROFESIONAL },
  '/nomina':               { modulo: 'nomina',               label: 'Nómina',               planMinimo: PlanTipo.EMPRESARIAL },
  '/vacaciones':           { modulo: 'vacaciones',           label: 'Vacaciones',           planMinimo: PlanTipo.EMPRESARIAL },
  '/evaluaciones':         { modulo: 'evaluaciones',         label: 'Evaluaciones',         planMinimo: PlanTipo.EMPRESARIAL },
  '/portal-empleado':      { modulo: 'portal-empleado',      label: 'Portal Empleado',      planMinimo: PlanTipo.EMPRESARIAL },
  '/proyectos':            { modulo: 'proyectos',            label: 'Proyectos',            planMinimo: PlanTipo.EMPRESARIAL },
  '/crm':                  { modulo: 'crm',                  label: 'CRM / Leads',          planMinimo: PlanTipo.EMPRESARIAL },
  '/auditoria':            { modulo: 'auditoria',            label: 'Auditoría',            planMinimo: PlanTipo.EMPRESARIAL },
  '/kpi':                  { modulo: 'kpi',                  label: 'KPIs',                 planMinimo: PlanTipo.EMPRESARIAL },
  '/analytics':            { modulo: 'analytics',            label: 'Analytics',            planMinimo: PlanTipo.EMPRESARIAL },
  '/manufactura':          { modulo: 'manufactura',          label: 'Manufactura',          planMinimo: PlanTipo.EMPRESARIAL },
  '/licitaciones':         { modulo: 'licitaciones',         label: 'Licitaciones',         planMinimo: PlanTipo.EMPRESARIAL },
};

export function planTieneModulo(plan: PlanTipo, modulo: string): boolean {
  const config = PLANES[plan];
  if (!config) return false;
  if (config.modulos.includes('*')) return true;
  return config.modulos.includes(modulo);
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

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaVencimiento!: Date;

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
