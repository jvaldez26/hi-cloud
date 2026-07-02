import { useQuery } from '@tanstack/react-query';
import { suscripcionesApi } from '../api/suscripciones.api';

export type PlanTipo =
  | 'emprendedor' | 'pyme' | 'pro' | 'plus'
  // Legado (datos históricos)
  | 'trial' | 'basico' | 'profesional' | 'empresarial' | 'enterprise';

export type EstadoSuscripcion = 'prueba' | 'activa' | 'suspendida' | 'vencida' | 'cancelada';

export interface PlanInfo {
  nombre:         string;
  precioMensual:  number;
  limiteIngresos: number;
  limiteUsuarios: number;
}

const PLANES_INFO: Record<string, PlanInfo> = {
  emprendedor: { nombre: 'Emprendedor', precioMensual: 29,  limiteIngresos: 125_000,   limiteUsuarios: 2 },
  pyme:        { nombre: 'Pyme',        precioMensual: 59,  limiteIngresos: 500_000,   limiteUsuarios: 3 },
  pro:         { nombre: 'Pro',         precioMensual: 89,  limiteIngresos: 1_250_000, limiteUsuarios: 4 },
  plus:        { nombre: 'Plus',        precioMensual: 129, limiteIngresos: 6_250_000, limiteUsuarios: 10 },
  // Legado
  trial:       { nombre: 'Trial',       precioMensual: 0,   limiteIngresos: 500_000,   limiteUsuarios: -1 },
  basico:      { nombre: 'Básico',      precioMensual: 0,   limiteIngresos: 125_000,   limiteUsuarios: 2 },
  profesional: { nombre: 'Profesional', precioMensual: 0,   limiteIngresos: 500_000,   limiteUsuarios: 3 },
  empresarial: { nombre: 'Empresarial', precioMensual: 0,   limiteIngresos: 1_250_000, limiteUsuarios: 10 },
  enterprise:  { nombre: 'Enterprise',  precioMensual: 0,   limiteIngresos: -1,        limiteUsuarios: -1 },
};

// Todos los planes incluyen todos los módulos
export function tieneModulo(_plan: PlanTipo, _modulo: string): boolean {
  return true;
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function usePlan() {
  const { data: suscripcion, isLoading: loadingPlan } = useQuery({
    queryKey: ['mi-plan'],
    queryFn:  suscripcionesApi.miPlan,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const { data: limites, isLoading: loadingLimites } = useQuery({
    queryKey: ['mis-limites'],
    queryFn:  suscripcionesApi.misLimites,
    staleTime: 2 * 60 * 1000,
    enabled: !!suscripcion,
    retry: false,
  });

  const plan     = (suscripcion?.plan ?? 'emprendedor') as PlanTipo;
  const estado   = (suscripcion?.estado ?? 'prueba') as EstadoSuscripcion;
  const modulos  = (suscripcion?.info?.features ?? ['*']) as string[];
  const planInfo = PLANES_INFO[plan] ?? PLANES_INFO['emprendedor'];

  return {
    plan,
    planNombre:    suscripcion?.info?.nombre ?? planInfo.nombre,
    diasRestantes: suscripcion?.diasRestantes ?? 0,
    estado,
    enPrueba:      estado === 'prueba',
    suspendida:    estado === 'suspendida',
    suscripcion,
    limites,
    isLoading:     loadingPlan || loadingLimites,
    tieneModulo:   (modulo: string) => tieneModulo(plan, modulo),
    modulos,
    planInfo,
  };
}

// ── Hook de guard de módulo (siempre permitido — todos los módulos en todos los planes) ────

export interface PlanGuardConfig {
  modulo:     string;
  label:      string;
  planMinimo: PlanTipo;
}

export function usePlanGuard() {
  const { plan, isLoading } = usePlan();
  // Todos los módulos están disponibles en todos los planes — nunca bloqueado
  return {
    bloqueado: false,
    config: null as PlanGuardConfig | null,
    plan,
    isLoading,
  };
}
