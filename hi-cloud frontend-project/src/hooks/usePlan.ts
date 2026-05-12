import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { suscripcionesApi } from '../api/suscripciones.api';

// ── Configuración de módulos por plan (espejo del backend) ────────────────────

export type PlanTipo = 'trial' | 'basico' | 'profesional' | 'empresarial' | 'enterprise';

export interface PlanConfig {
  nombre:         string;
  precio:         number;
  diasPrueba:     number;
  maxUsuarios:    number;
  maxFacturasMes: number;
  maxProductos:   number;
  maxClientes:    number;
  maxSucursales:  number;
  modulos:        string[];
  soporte:        string;
}

// Mapa ruta → módulo requerido
const RUTA_MODULO: Record<string, { modulo: string; label: string; planMinimo: PlanTipo }> = {
  '/ecf':                  { modulo: 'ecf',                 label: 'e-CF DGII',           planMinimo: 'basico' },
  '/compras':              { modulo: 'compras',              label: 'Compras',              planMinimo: 'basico' },
  '/proveedores':          { modulo: 'proveedores',          label: 'Proveedores',          planMinimo: 'basico' },
  '/contabilidad':         { modulo: 'contabilidad',         label: 'Contabilidad',         planMinimo: 'profesional' },
  '/cxc':                  { modulo: 'cxc',                  label: 'Cuentas por Cobrar',   planMinimo: 'profesional' },
  '/cxp':                  { modulo: 'cxp',                  label: 'Cuentas por Pagar',    planMinimo: 'profesional' },
  '/libro-mayor':          { modulo: 'libro-mayor',          label: 'Libro Mayor',          planMinimo: 'profesional' },
  '/activos-fijos':        { modulo: 'activos-fijos',        label: 'Activos Fijos',        planMinimo: 'profesional' },
  '/presupuestos':         { modulo: 'presupuestos',         label: 'Presupuestos',         planMinimo: 'profesional' },
  '/sucursales':           { modulo: 'sucursales',           label: 'Multi-Sucursal',       planMinimo: 'profesional' },
  '/declaraciones':        { modulo: 'declaraciones',        label: 'Declaraciones DGII',   planMinimo: 'profesional' },
  '/periodo-contable':     { modulo: 'periodo-contable',     label: 'Período Contable',     planMinimo: 'profesional' },
  '/reportes-financieros': { modulo: 'reportes-financieros', label: 'Reportes Financieros', planMinimo: 'profesional' },
  '/balance-comprobacion': { modulo: 'balance-comprobacion', label: 'Balance Comprobación', planMinimo: 'profesional' },
  '/libro-ventas':         { modulo: 'libro-ventas',         label: 'Libro de Ventas',      planMinimo: 'profesional' },
  '/nomina':               { modulo: 'nomina',               label: 'Nómina',               planMinimo: 'empresarial' },
  '/vacaciones':           { modulo: 'vacaciones',           label: 'Vacaciones',           planMinimo: 'empresarial' },
  '/evaluaciones':         { modulo: 'evaluaciones',         label: 'Evaluaciones',         planMinimo: 'empresarial' },
  '/portal-empleado':      { modulo: 'portal-empleado',      label: 'Portal Empleado',      planMinimo: 'empresarial' },
  '/capacitacion':         { modulo: 'capacitacion',         label: 'Capacitación',         planMinimo: 'empresarial' },
  '/proyectos':            { modulo: 'proyectos',            label: 'Proyectos',            planMinimo: 'empresarial' },
  '/crm':                  { modulo: 'crm',                  label: 'CRM / Leads',          planMinimo: 'empresarial' },
  '/auditoria':            { modulo: 'auditoria',            label: 'Auditoría',            planMinimo: 'empresarial' },
  '/kpi':                  { modulo: 'kpi',                  label: 'KPIs',                 planMinimo: 'empresarial' },
  '/analytics':            { modulo: 'analytics',            label: 'Analytics',            planMinimo: 'empresarial' },
  '/manufactura':          { modulo: 'manufactura',          label: 'Manufactura',          planMinimo: 'empresarial' },
  '/licitaciones':         { modulo: 'licitaciones',         label: 'Licitaciones',         planMinimo: 'empresarial' },
  '/flota':                { modulo: 'flota',                label: 'Gestión de Flota',     planMinimo: 'empresarial' },
  '/mantenimiento':        { modulo: 'mantenimiento',        label: 'Mantenimiento',        planMinimo: 'empresarial' },
};

const PLAN_ORDEN: PlanTipo[] = ['trial', 'basico', 'profesional', 'empresarial', 'enterprise'];

export function planIncluye(planActual: PlanTipo, planMinimo: PlanTipo): boolean {
  return PLAN_ORDEN.indexOf(planActual) >= PLAN_ORDEN.indexOf(planMinimo);
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function usePlan() {
  const { data: suscripcion, isLoading: loadingPlan } = useQuery({
    queryKey: ['mi-plan'],
    queryFn:  suscripcionesApi.miPlan,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: limites, isLoading: loadingLimites } = useQuery({
    queryKey: ['mis-limites'],
    queryFn:  suscripcionesApi.misLimites,
    staleTime: 2 * 60 * 1000,
    enabled: !!suscripcion,
    retry: false,
  });

  const plan     = (suscripcion?.plan ?? 'trial') as PlanTipo;
  const modulos  = (suscripcion?.info?.features ?? []) as string[];

  function tieneModulo(modulo: string): boolean {
    if (modulos.includes('*')) return true;
    return modulos.includes(modulo);
  }

  return {
    plan,
    planNombre:  suscripcion?.info?.nombre ?? plan,
    diasRestantes: suscripcion?.diasRestantes ?? 0,
    estado:      suscripcion?.estado ?? 'activa',
    suscripcion,
    limites,
    isLoading:   loadingPlan || loadingLimites,
    tieneModulo,
    modulos,
  };
}

// ── Hook para verificar la ruta actual ───────────────────────────────────────

export function usePlanGuard() {
  const { pathname } = useLocation();
  const { plan, tieneModulo, isLoading } = usePlan();

  const config = RUTA_MODULO[pathname] ?? RUTA_MODULO[pathname.replace(/\/\d+.*$/, '')];

  if (!config || isLoading) return { bloqueado: false, config: null, plan };

  const bloqueado = !planIncluye(plan, config.planMinimo);
  return { bloqueado, config, plan };
}
