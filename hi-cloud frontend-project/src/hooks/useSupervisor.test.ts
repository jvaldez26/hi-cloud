import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useSupervisor, type PoliticaSupervisor } from './useSupervisor';

/**
 * Modo supervisor del POS — rediseño por políticas (una por pestaña/acción,
 * ver Configuración → Modo Supervisor), en vez del interruptor genérico
 * supervisorModeEnabled de antes. Lo que se afirma aquí sigue siendo literal
 * al bug real que el mecanismo de sesión corrige: la sesión vivía en
 * sessionStorage (moría al cerrar la pestaña) mientras auth.store.ts ya
 * limpiaba 'pos_supervisor' de localStorage en logout() desde antes — dos
 * mitades de un mecanismo que nunca se tocaban. Y los dos cierres
 * audit-relevantes: manual (ESC/×) y por expiración de las 8h.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: apiMock }));

const STORAGE_KEY = 'pos_supervisor';

const POLITICA_CERRAR_CAJA_SESION: PoliticaSupervisor = { clave: 'cerrar_caja', label: 'Cerrar caja', descripcion: '', grupo: 'Caja', requerido: true, modo: 'sesion' };
const POLITICA_CERRAR_CAJA_APAGADA: PoliticaSupervisor = { ...POLITICA_CERRAR_CAJA_SESION, requerido: false };
const POLITICA_VENTA_CREDITO_CADA_VEZ: PoliticaSupervisor = { clave: 'venta_credito', label: 'Venta a crédito', descripcion: '', grupo: 'Acciones de venta', requerido: true, modo: 'cada_vez' };

/** Por defecto: el umbral de descuento y el catálogo con la política de prueba que cada test necesite. */
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
  sessionStorage.clear();
  mockEndpoints([POLITICA_CERRAR_CAJA_SESION]);
  apiMock.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => { vi.clearAllMocks(); });

describe('useSupervisor — persistencia', () => {
  it('activar una sesión la guarda en localStorage (NO sessionStorage) con el sessionId', async () => {
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    act(() => { result.current.resolveModal(true, 'Ana Supervisor', 'admin', 42); });

    expect(result.current.supervisorActive).toBe(true);
    expect(result.current.supervisorSession?.sessionId).toBe(42);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({ nombre: 'Ana Supervisor', sessionId: 42 });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull(); // el bug que se corrige: ya no vive aquí
  });

  it('una sesión guardada en localStorage sobrevive un remount (simula cerrar/reabrir la pestaña)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nombre: 'Ana Supervisor', role: 'admin', until: Date.now() + 60_000, sessionId: 7,
    }));

    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    expect(result.current.supervisorActive).toBe(true);
    expect(result.current.supervisorSession?.sessionId).toBe(7);
  });
});

describe('useSupervisor — auditoría de cierre', () => {
  it('cierre manual (clearSupervisor) audita motivo=manual con el sessionId real', async () => {
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));
    act(() => { result.current.resolveModal(true, 'Ana Supervisor', 'admin', 42); });

    act(() => { result.current.clearSupervisor(); });

    expect(result.current.supervisorActive).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/supervisor-log/cerrar', { sessionId: 42, motivo: 'manual' });
  });

  it('una sesión ya expirada al montar (pestaña reabierta después de 8h) audita motivo=expiracion', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nombre: 'Ana Supervisor', role: 'admin', until: Date.now() - 1000, sessionId: 99,
    }));

    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    expect(result.current.supervisorActive).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/supervisor-log/cerrar', { sessionId: 99, motivo: 'expiracion' });
  });

  it('sesión sin sessionId (dato viejo, previo a este cambio): cierra local sin llamar al backend', async () => {
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));
    act(() => { result.current.resolveModal(true, 'Ana Supervisor', 'admin', null); });

    act(() => { result.current.clearSupervisor(); });

    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe('useSupervisor — requireSupervisor (gate por clave, modo "sesion")', () => {
  it('política requerida y sin sesión activa: bloquea (la promesa no resuelve) hasta que el modal autoriza', async () => {
    mockEndpoints([POLITICA_CERRAR_CAJA_SESION]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    let resuelto: { ok: boolean; token?: string } | undefined;
    act(() => {
      result.current.requireSupervisor('cerrar_caja', 'Cierre de Caja', 'Monto: RD$7,500.00').then(r => { resuelto = r; });
    });

    // Sigue pendiente — el modal está abierto (pendingAction), no autorizado todavía.
    expect(resuelto).toBeUndefined();
    expect(result.current.pendingAction).toEqual({ action: 'Cierre de Caja', detail: 'Monto: RD$7,500.00', clave: 'cerrar_caja' });

    // El modal autoriza (mismo flujo que cualquier otra acción protegida).
    await act(async () => { result.current.resolveModal(true, 'Ana Supervisor', 'admin', 55); });

    expect(resuelto).toEqual({ ok: true, token: undefined });
    expect(result.current.supervisorActive).toBe(true);
  });

  it('ya hay sesión activa: pasa directo, sin abrir el modal', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nombre: 'Ana Supervisor', role: 'admin', until: Date.now() + 60_000, sessionId: 7,
    }));
    mockEndpoints([POLITICA_CERRAR_CAJA_SESION]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    let resuelto: { ok: boolean } | undefined;
    await act(async () => {
      resuelto = await result.current.requireSupervisor('cerrar_caja', 'Cierre de Caja');
    });

    expect(resuelto).toEqual({ ok: true, token: undefined });
    expect(result.current.pendingAction).toBeNull();
  });

  it('política desmarcada (requerido=false): pasa directo, sin abrir el modal', async () => {
    mockEndpoints([POLITICA_CERRAR_CAJA_APAGADA]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    const resuelto = await result.current.requireSupervisor('cerrar_caja', 'Cierre de Caja');

    expect(resuelto).toEqual({ ok: true });
    expect(result.current.pendingAction).toBeNull();
  });

  it('clave que no está en el catálogo devuelto por el backend: pasa directo (defensivo, igual que el backend)', async () => {
    mockEndpoints([]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas).toEqual([]));

    const resuelto = await result.current.requireSupervisor('clave-inexistente', 'Acción');

    expect(resuelto).toEqual({ ok: true });
  });
});

describe('useSupervisor — requireSupervisor (gate por clave, modo "cada_vez")', () => {
  it('con sesión activa, IGUAL pide autorización — modo cada_vez ignora la sesión existente', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nombre: 'Ana Supervisor', role: 'admin', until: Date.now() + 60_000, sessionId: 7,
    }));
    mockEndpoints([POLITICA_VENTA_CREDITO_CADA_VEZ]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    let resuelto: { ok: boolean; token?: string } | undefined;
    act(() => {
      result.current.requireSupervisor('venta_credito', 'Venta a Crédito').then(r => { resuelto = r; });
    });
    expect(result.current.pendingAction).not.toBeNull(); // pidió autorización pese a la sesión activa

    await act(async () => { result.current.resolveModal(true, 'Ana Supervisor', 'admin', 55, 'tok-abc123'); });

    expect(resuelto).toEqual({ ok: true, token: 'tok-abc123' });
  });

  it('el cajero cancela el modal: resuelve { ok: false }', async () => {
    mockEndpoints([POLITICA_VENTA_CREDITO_CADA_VEZ]);
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.politicas.length).toBeGreaterThan(0));

    let resuelto: { ok: boolean; token?: string } | undefined;
    act(() => {
      result.current.requireSupervisor('venta_credito', 'Venta a Crédito').then(r => { resuelto = r; });
    });

    await act(async () => { result.current.resolveModal(false); });

    expect(resuelto).toEqual({ ok: false });
  });
});
