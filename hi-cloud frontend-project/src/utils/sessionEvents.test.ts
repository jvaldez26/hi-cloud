import { describe, it, expect, beforeEach } from 'vitest';
import { registerReauthHandler, solicitarReautenticacion } from './sessionEvents';

/**
 * El handler "por defecto" (ReautenticacionGlobalModal, montado una sola vez
 * en el layout raíz) nunca debe desaparecer cuando un handler específico
 * (ej. el del POS) se registra y luego se desregistra — antes de este
 * cambio, salir del POS dejaba la sesión entera sin reautenticación in-place
 * por el resto de la sesión del navegador (ver sessionEvents.ts).
 */
describe('sessionEvents — registerReauthHandler / solicitarReautenticacion', () => {
  beforeEach(() => {
    // Limpiar ambos slots entre tests (no hay un "reset" exportado a propósito
    // — es estado de módulo real, como en producción).
    registerReauthHandler(null, true);
    registerReauthHandler(null);
  });

  it('sin ningún handler registrado, solicitarReautenticacion() resuelve false', async () => {
    await expect(solicitarReautenticacion()).resolves.toBe(false);
  });

  it('con solo el handler por defecto, lo usa', async () => {
    registerReauthHandler(async () => true, true);
    await expect(solicitarReautenticacion()).resolves.toBe(true);
  });

  it('un handler específico (POS) pisa al por defecto mientras está registrado', async () => {
    registerReauthHandler(async () => true, true);   // global
    registerReauthHandler(async () => false);         // POS
    await expect(solicitarReautenticacion()).resolves.toBe(false);
  });

  it('al desregistrar el específico (null), VUELVE al por defecto — nunca se queda sin ninguno', async () => {
    registerReauthHandler(async () => true, true);    // global
    registerReauthHandler(async () => false);          // POS entra
    registerReauthHandler(null);                       // POS sale (unmount)

    await expect(solicitarReautenticacion()).resolves.toBe(true); // vuelve al global, no queda en null
  });

  it('re-registrar el por defecto con null lo quita de verdad (ya no hay fallback)', async () => {
    registerReauthHandler(async () => true, true);
    registerReauthHandler(null, true);
    await expect(solicitarReautenticacion()).resolves.toBe(false);
  });

  it('si el handler activo lanza, solicitarReautenticacion() resuelve false en vez de propagar', async () => {
    registerReauthHandler(async () => { throw new Error('boom'); });
    await expect(solicitarReautenticacion()).resolves.toBe(false);
  });
});
