import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import apiClient from './client';
import { registerSupervisorAuthHandler } from '../utils/sessionEvents';

/**
 * El interceptor de Axios en client.ts debe resolver CUALQUIER 403 con
 * `supervisorClaveRequerida` de forma genérica — sin que la pantalla que
 * disparó la petición sepa de antemano que esa clave hacía falta. Pedido
 * explícito: "por cada clave del catálogo en modo 'cada_vez', la acción pide
 * supervisor y luego se completa; un token usado no sirve para una segunda
 * acción."
 *
 * Se invoca el handler `rejected` registrado por el interceptor directamente
 * (`apiClient.interceptors.response.handlers[0].rejected`) — único punto de
 * introspección que expone Axios para esto; no hay mock-adapter instalado en
 * el proyecto y esto evita depender de uno nuevo solo para esta prueba.
 */
function rejectedHandler(): (err: any) => Promise<any> {
  const handlers = (apiClient.interceptors.response as any).handlers;
  return handlers[0].rejected;
}

function fakeError(opts: { status: number; data: any; url?: string; headers?: Record<string, string> }) {
  return {
    isAxiosError: true,
    response: { status: opts.status, data: opts.data, headers: {} },
    config: { url: opts.url ?? '/caja/1/cerrar', headers: opts.headers ?? {}, method: 'patch' },
    message: 'Request failed',
  };
}

describe('client.ts — interceptor genérico de 403 "falta autorización de supervisor"', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({ data: { success: true, data: { ok: true } } } as any);
  });
  afterEach(() => {
    registerSupervisorAuthHandler(null);
    vi.restoreAllMocks();
  });

  it('pide autorización para la clave del 403, y reintenta la MISMA petición con el token en el header', async () => {
    const handlerFn = vi.fn().mockResolvedValue({ ok: true, token: 'tok-abc123' });
    registerSupervisorAuthHandler(handlerFn);

    const err = fakeError({ status: 403, data: { errors: ['Esta acción requiere...'], supervisorClaveRequerida: 'cerrar_caja', supervisorModo: 'cada_vez' } });
    await rejectedHandler()(err);

    expect(handlerFn).toHaveBeenCalledWith('cerrar_caja', 'cerrar_caja', undefined);
    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const reintentado = (apiClient.request as any).mock.calls[0][0];
    expect(reintentado.headers['x-supervisor-token']).toBe('tok-abc123');
    expect(reintentado._retrySupervisor).toBe(true);
  });

  it('modo "sesion": reintenta SIN token (el guard valida contra la sesión, no un header)', async () => {
    const handlerFn = vi.fn().mockResolvedValue({ ok: true }); // sin token — modo sesión
    registerSupervisorAuthHandler(handlerFn);

    const err = fakeError({ status: 403, data: { supervisorClaveRequerida: 'crear_producto', supervisorModo: 'sesion' } });
    await rejectedHandler()(err);

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const reintentado = (apiClient.request as any).mock.calls[0][0];
    expect(reintentado.headers['x-supervisor-token']).toBeUndefined();
  });

  it('el cajero cancela la autorización: NO reintenta, el error original se propaga', async () => {
    const handlerFn = vi.fn().mockResolvedValue({ ok: false });
    registerSupervisorAuthHandler(handlerFn);

    const err = fakeError({ status: 403, data: { supervisorClaveRequerida: 'venta_credito' } });
    await expect(rejectedHandler()(err)).rejects.toBe(err);
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('un token ya usado (el reintento vuelve a dar el mismo 403): NO se reintenta una segunda vez', async () => {
    const handlerFn = vi.fn().mockResolvedValue({ ok: true, token: 'tok-usado' });
    registerSupervisorAuthHandler(handlerFn);

    const errOriginal = fakeError({ status: 403, data: { supervisorClaveRequerida: 'registrar_retiro', supervisorModo: 'cada_vez' } });
    await rejectedHandler()(errOriginal);
    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const configReintentado = (apiClient.request as any).mock.calls[0][0];
    expect(configReintentado._retrySupervisor).toBe(true);

    // Simula que ESE reintento (con el token ya consumido por el backend) también
    // choca con un 403 — el interceptor lo recibe de nuevo con el MISMO config,
    // ya marcado _retrySupervisor.
    const errSegundaVez = fakeError({
      status: 403,
      data: { supervisorClaveRequerida: 'registrar_retiro', supervisorModo: 'cada_vez' },
    });
    errSegundaVez.config = configReintentado; // el config que ya trae _retrySupervisor=true

    await expect(rejectedHandler()(errSegundaVez)).rejects.toBe(errSegundaVez);
    // El handler de autorización no se volvió a llamar — no hay un segundo intento.
    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('sin handler registrado (fuera del POS): no reintenta, el error se propaga tal cual', async () => {
    registerSupervisorAuthHandler(null);
    const err = fakeError({ status: 403, data: { supervisorClaveRequerida: 'ver_reportes' } });
    await expect(rejectedHandler()(err)).rejects.toBe(err);
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('un 403 sin supervisorClaveRequerida (negocio normal) no dispara el flujo de supervisor', async () => {
    const handlerFn = vi.fn();
    registerSupervisorAuthHandler(handlerFn);

    const err = fakeError({ status: 403, data: { errors: ['No tienes permisos para esta acción'] } });
    await expect(rejectedHandler()(err)).rejects.toBeDefined();
    expect(handlerFn).not.toHaveBeenCalled();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it.each([
    'venta_credito', 'anular_documento', 'crear_nota_credito', 'devolucion_efectivo',
    'cerrar_caja', 'registrar_retiro', 'descuento_excedido', 'modificar_precio',
  ])('clave "%s" en modo cada_vez: pide supervisor y la acción se completa con el token', async (clave) => {
    const handlerFn = vi.fn().mockResolvedValue({ ok: true, token: `tok-${clave}` });
    registerSupervisorAuthHandler(handlerFn);

    const err = fakeError({ status: 403, data: { supervisorClaveRequerida: clave, supervisorModo: 'cada_vez' } });
    await rejectedHandler()(err);

    expect(handlerFn).toHaveBeenCalledWith(clave, clave, undefined);
    const reintentado = (apiClient.request as any).mock.calls[0][0];
    expect(reintentado.headers['x-supervisor-token']).toBe(`tok-${clave}`);
  });
});
