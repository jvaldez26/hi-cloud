import { describe, it, expect, vi, beforeEach } from 'vitest';

// Los exports de @sentry/react no se pueden espiar con vi.spyOn (bindings ESM
// de solo lectura en este build) — se reemplaza el módulo entero, igual que
// en useFormDraft.test.tsx.
vi.mock('@sentry/react', () => ({
  captureMessage:   vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb:     vi.fn(),
}));
import * as Sentry from '@sentry/react';
import { registrarCajaPrecheckVacio } from './posTelemetria';

/**
 * Incidente real (2026-10-16, empresa 44): el precheck de caja del POS no
 * encontraba la caja en caché sin que el backend la rechazara nunca — esta
 * señal sube a Sentry en ESE momento, con el contexto para encontrar el
 * disparador (vendedorId obsoleto, refresh de token, timing del polling,
 * pestaña oculta). Nunca bloquea el cobro — eso lo decide
 * cajaPrecheckGate.ts, no esta telemetría.
 */
describe('registrarCajaPrecheckVacio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sube un warning a Sentry con todo el contexto de diagnóstico', () => {
    registrarCajaPrecheckVacio({
      usuarioId:  25,
      sucursalId: 45,
      vendedorId: 25,
      msDesdeUltimoRefreshToken:   120_000,
      msDesdeUltimoPollingCajaHoy: 45_000,
      pestanaOculta: false,
    });

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [msg, opts] = (Sentry.captureMessage as any).mock.calls[0];
    expect(msg).toMatch(/Precheck de caja/);
    expect(opts.level).toBe('warning');
    expect(opts.tags.tipo).toBe('caja-precheck-vacio');
    expect(opts.extra).toMatchObject({
      usuarioId:  25,
      sucursalId: 45,
      vendedorId: 25,
      msDesdeUltimoRefreshToken:   120_000,
      msDesdeUltimoPollingCajaHoy: 45_000,
      pestanaOculta: false,
    });
  });

  it('acepta valores null (refresh nunca ocurrió, nunca hubo polling previo) sin reventar', () => {
    expect(() => registrarCajaPrecheckVacio({
      usuarioId:  undefined,
      sucursalId: undefined,
      vendedorId: 7,
      msDesdeUltimoRefreshToken:   null,
      msDesdeUltimoPollingCajaHoy: null,
      pestanaOculta: true,
    })).not.toThrow();
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });
});
