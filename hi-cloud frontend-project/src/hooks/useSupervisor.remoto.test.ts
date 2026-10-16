import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useSupervisor, type PoliticaSupervisor } from './useSupervisor';

/**
 * Autorización REMOTA de Modo Supervisor (ver src/autorizacion-remota/ en
 * el backend) — cubre, del lado del hook: la opción no aparece si la
 * política no admite remoto, la solicitud pasa a "en espera" al crearla, y
 * se resuelve según lo que el polling de estado() reporte (aprobada con
 * token, rechazada/expirada con motivo).
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: apiMock }));

const autorizacionRemotaApiMock = vi.hoisted(() => ({
  crear: vi.fn(), estado: vi.fn(), cancelar: vi.fn(),
}));
vi.mock('../api/autorizacionRemota.api', () => ({ autorizacionRemotaApi: autorizacionRemotaApiMock }));

const POLITICA_SIN_REMOTO: PoliticaSupervisor = {
  clave: 'cierre_caja_descuadre', label: 'Cierre con descuadre', descripcion: '', grupo: 'Caja',
  requerido: true, modo: 'cada_vez', permiteRemoto: false,
};
const POLITICA_CON_REMOTO: PoliticaSupervisor = {
  clave: 'venta_credito', label: 'Venta a crédito', descripcion: '', grupo: 'Acciones de venta',
  requerido: true, modo: 'cada_vez', permiteRemoto: true,
};

function mockEndpoints(politicas: PoliticaSupervisor[]) {
  apiMock.get.mockImplementation((url: string) => {
    if (url.includes('pos-config'))          return Promise.resolve({ data: { maxDiscountPercent: 10 } });
    if (url.includes('supervisor-politicas')) return Promise.resolve({ data: politicas });
    return Promise.resolve({ data: {} });
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  localStorage.clear();
  apiMock.post.mockResolvedValue({ data: { ok: true } });
  // Default inocuo — los tests que necesitan un estado concreto lo sobrescriben.
  autorizacionRemotaApiMock.estado.mockResolvedValue({
    id: 0, estado: 'pendiente', comentario: null, supervisorNombre: null, token: null,
    expiraEn: new Date(Date.now() + 180_000).toISOString(),
  });
});
afterEach(() => { vi.clearAllMocks(); });

describe('useSupervisor — autorización remota', () => {
  it('política sin permiteRemoto: la opción no debe ofrecerse', async () => {
    mockEndpoints([POLITICA_SIN_REMOTO]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    act(() => { void result.current.requireSupervisor('cierre_caja_descuadre'); });
    await waitFor(() => expect(result.current.pendingAction).not.toBeNull());

    expect(result.current.pendingActionPermiteRemoto).toBe(false);
  });

  it('política con permiteRemoto: la opción sí se ofrece', async () => {
    mockEndpoints([POLITICA_CON_REMOTO]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    act(() => { void result.current.requireSupervisor('venta_credito'); });
    await waitFor(() => expect(result.current.pendingAction).not.toBeNull());

    expect(result.current.pendingActionPermiteRemoto).toBe(true);
  });

  it('solicitarAutorizacionRemota: crea la solicitud y queda "en espera"', async () => {
    mockEndpoints([POLITICA_CON_REMOTO]);
    autorizacionRemotaApiMock.crear.mockResolvedValue({ id: 55, expiraEn: new Date(Date.now() + 180_000).toISOString() });

    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));
    act(() => { void result.current.requireSupervisor('venta_credito'); });
    await waitFor(() => expect(result.current.pendingAction).not.toBeNull());

    await act(async () => { await result.current.solicitarAutorizacionRemota('Cliente de confianza, sin supervisor en la tienda'); });

    expect(autorizacionRemotaApiMock.crear).toHaveBeenCalledWith(
      expect.objectContaining({ clave: 'venta_credito', motivo: 'Cliente de confianza, sin supervisor en la tienda' }),
    );
    expect(result.current.remotoEnEspera?.solicitudId).toBe(55);
  });

  it('aprobada con token: resuelve requireSupervisor con { ok:true, token }', async () => {
    mockEndpoints([POLITICA_CON_REMOTO]);
    autorizacionRemotaApiMock.crear.mockResolvedValue({ id: 56, expiraEn: new Date(Date.now() + 180_000).toISOString() });
    autorizacionRemotaApiMock.estado.mockResolvedValue({
      id: 56, estado: 'aprobada', comentario: null, supervisorNombre: 'Jean Admin', token: 'tok-remoto-xyz', expiraEn: new Date().toISOString(),
    });

    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    let resuelto: { ok: boolean; token?: string } | undefined;
    act(() => { void result.current.requireSupervisor('venta_credito').then(r => { resuelto = r; }); });
    await waitFor(() => expect(result.current.pendingAction).not.toBeNull());
    await act(async () => { await result.current.solicitarAutorizacionRemota('motivo válido'); });

    await waitFor(() => expect(resuelto).toEqual({ ok: true, token: 'tok-remoto-xyz' }));
    expect(result.current.remotoEnEspera).toBeNull();
  });

  it('rechazada con comentario: resuelve { ok:false } y expone el motivo del supervisor', async () => {
    mockEndpoints([POLITICA_CON_REMOTO]);
    autorizacionRemotaApiMock.crear.mockResolvedValue({ id: 57, expiraEn: new Date(Date.now() + 180_000).toISOString() });
    autorizacionRemotaApiMock.estado.mockResolvedValue({
      id: 57, estado: 'rechazada', comentario: 'Monto muy alto para autorizar sin verlo', supervisorNombre: 'Jean Admin', token: null, expiraEn: new Date().toISOString(),
    });

    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    let resuelto: { ok: boolean } | undefined;
    act(() => { void result.current.requireSupervisor('venta_credito').then(r => { resuelto = r; }); });
    await waitFor(() => expect(result.current.pendingAction).not.toBeNull());
    await act(async () => { await result.current.solicitarAutorizacionRemota('motivo válido'); });

    await waitFor(() => expect(resuelto).toEqual({ ok: false }));
    expect(result.current.remotoResultado).toEqual({ estado: 'rechazada', comentario: 'Monto muy alto para autorizar sin verlo' });
  });

  it('cancelarAutorizacionRemota: avisa al backend y resuelve { ok:false } de inmediato', async () => {
    mockEndpoints([POLITICA_CON_REMOTO]);
    autorizacionRemotaApiMock.crear.mockResolvedValue({ id: 58, expiraEn: new Date(Date.now() + 180_000).toISOString() });
    autorizacionRemotaApiMock.cancelar.mockResolvedValue({ ok: true });
    autorizacionRemotaApiMock.estado.mockResolvedValue({
      id: 58, estado: 'pendiente', comentario: null, supervisorNombre: null, token: null, expiraEn: new Date(Date.now() + 180_000).toISOString(),
    });

    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    let resuelto: { ok: boolean } | undefined;
    act(() => { void result.current.requireSupervisor('venta_credito').then(r => { resuelto = r; }); });
    await waitFor(() => expect(result.current.pendingAction).not.toBeNull());
    await act(async () => { await result.current.solicitarAutorizacionRemota('motivo válido'); });
    await waitFor(() => expect(result.current.remotoEnEspera).not.toBeNull());

    await act(async () => { await result.current.cancelarAutorizacionRemota(); });

    expect(autorizacionRemotaApiMock.cancelar).toHaveBeenCalledWith(58);
    await waitFor(() => expect(resuelto).toEqual({ ok: false }));
    expect(result.current.remotoEnEspera).toBeNull();
  });
});
