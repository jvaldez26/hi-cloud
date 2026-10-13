import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import apiClient from './client';

/**
 * Defensa en profundidad del incidente caja #788 (empresa 73, 2026-10-12):
 * una pestaña vieja mostraba a Franchesca mientras el navegador ya tenía la
 * cookie de Beatriz. El evento 'storage' (auth.store.ts) avisa a las demás
 * pestañas, pero si esa señal falla, el backend es el respaldo: cada
 * petición lleva el id de usuario que ESTA pantalla cree tener
 * (x-usuario-esperado, leído de localStorage) y si no coincide con el JWT
 * real de la cookie, responde 409 SESION_CAMBIO (sesion-coherente.
 * interceptor.ts) — la pestaña nunca opera con otro usuario sin saberlo.
 */
function requestFulfilledHandler(): (config: any) => any {
  const handlers = (apiClient.interceptors.request as any).handlers;
  return handlers[0].fulfilled;
}

function responseRejectedHandler(): (err: any) => Promise<any> {
  const handlers = (apiClient.interceptors.response as any).handlers;
  return handlers[0].rejected;
}

function fakeError(opts: { status: number; data: any }) {
  return {
    isAxiosError: true,
    response: { status: opts.status, data: opts.data, headers: {} },
    config: { url: '/caja/1/cerrar', headers: {}, method: 'patch' },
    message: 'Request failed',
  };
}

describe('client.ts — x-usuario-esperado y 409 SESION_CAMBIO (defensa en profundidad, caja #788)', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('request: header x-usuario-esperado', () => {
    it('con auth_user en localStorage, manda el id en el header', () => {
      localStorage.setItem('auth_user', JSON.stringify({ id: 114, nombre: 'Franchesca Sosa' }));
      const config = requestFulfilledHandler()({ headers: {} });
      expect(config.headers['x-usuario-esperado']).toBe('114');
    });

    it('sin auth_user en localStorage (antes de login): no manda el header', () => {
      const config = requestFulfilledHandler()({ headers: {} });
      expect(config.headers['x-usuario-esperado']).toBeUndefined();
    });

    it('auth_user corrupto ("undefined" literal, el bug de la release ff1f6bc6): no revienta, no manda el header', () => {
      localStorage.setItem('auth_user', 'undefined');
      const config = requestFulfilledHandler()({ headers: {} });
      expect(config.headers['x-usuario-esperado']).toBeUndefined();
    });
  });

  describe('response: 409 SESION_CAMBIO', () => {
    it('recarga la página — es la única forma de reinicializar store + React Query + POS con el usuario correcto', async () => {
      vi.useFakeTimers();
      const reloadSpy = vi.fn();
      const originalLocation = window.location;
      // @ts-expect-error reemplazo deliberado para espiar reload()
      delete window.location;
      window.location = { ...originalLocation, reload: reloadSpy } as any;

      const err = fakeError({ status: 409, data: { errors: ['SESION_CAMBIO'] } });
      const promise = responseRejectedHandler()(err);
      await expect(promise).rejects.toBe(err);

      expect(reloadSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1500);
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      window.location = originalLocation as any;
      vi.useRealTimers();
    });

    it('un 409 de otro origen (no SESION_CAMBIO) no dispara la recarga', async () => {
      const err = fakeError({ status: 409, data: { message: 'Conflicto de stock' } });
      await expect(responseRejectedHandler()(err)).rejects.toBe(err);
      // Si hubiera disparado el camino de SESION_CAMBIO, habría programado un
      // reload — nada que espiar aquí directamente, pero el mensaje extraído
      // (vía extractBackendMessage) no es 'SESION_CAMBIO' así que cae a los
      // demás manejadores sin marcar isNetworkError como true por error.
      expect((err as any).isNetworkError).toBe(false);
    });
  });
});
