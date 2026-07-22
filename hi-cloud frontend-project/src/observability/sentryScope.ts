import * as Sentry from '@sentry/react';

/**
 * Deriva el módulo actual desde la ruta, para etiquetar los eventos de Sentry
 * (así un error sabe si vino del POS, contabilidad, etc.). El POS es el primer
 * objetivo de cobertura.
 */
export function moduloActual(): string {
  const p = typeof window !== 'undefined' ? window.location.pathname : '';
  if (p.startsWith('/pos')) return 'POS';
  const seg = p.split('/').filter(Boolean)[0];
  return seg || 'root';
}

interface ScopeState {
  user?:           { id: number; role?: string } | null;
  empresaActual?:  number | null;
  sucursalActual?: number | null;
  sucursalNombre?: string | null;
}

/**
 * Sincroniza el scope GLOBAL de Sentry con el usuario/empresa/sucursal actuales,
 * para que TODO evento del frontend (crash de render, fallo de mutación, 5xx de
 * API) sepa de qué empresa/cajero/sucursal provino, en vez de llegar pelado.
 *
 * Solo IDs internos + rol — NUNCA email/nombre/cédula/RNC (PII). El beforeSend de
 * instrument.ts refuerza esto reduciendo event.user a solo { id }.
 * No-op si Sentry no está inicializado (dev / sin DSN) — sus fns son seguras.
 */
export function syncSentryScope(state: ScopeState): void {
  try {
    const user = state.user ?? null;
    Sentry.setUser(user?.id != null ? { id: String(user.id) } : null);
    Sentry.setTags({
      empresaId:  state.empresaActual  != null ? String(state.empresaActual)  : '',
      sucursalId: state.sucursalActual != null ? String(state.sucursalActual) : '',
      rol:        user?.role ? String(user.role) : '',
    });
    Sentry.setContext('negocio', {
      empresaId:      state.empresaActual  ?? null,
      sucursalId:     state.sucursalActual ?? null,
      sucursalNombre: state.sucursalNombre ?? null,
      userId:         user?.id   ?? null,
      rol:            user?.role ?? null,
    });
  } catch {
    /* nunca romper la app por un fallo de observabilidad */
  }
}
