import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useSupervisor } from './useSupervisor';

/**
 * Modo supervisor del POS — lo que se afirma aquí es literal al bug real que
 * este cambio corrige: la sesión vivía en sessionStorage (moría al cerrar la
 * pestaña) mientras auth.store.ts ya limpiaba 'pos_supervisor' de
 * localStorage en logout() desde antes — dos mitades de un mecanismo que
 * nunca se tocaban. Y los dos cierres audit-relevantes del pedido: manual
 * (ESC/×) y por expiración de las 8h, ambos deben avisarle al backend.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: apiMock }));

const STORAGE_KEY = 'pos_supervisor';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apiMock.get.mockResolvedValue({ data: { supervisorModeEnabled: true, maxDiscountPercent: 10 } });
  apiMock.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => { vi.clearAllMocks(); });

describe('useSupervisor — persistencia', () => {
  it('activar una sesión la guarda en localStorage (NO sessionStorage) con el sessionId', async () => {
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.supervisorModeEnabled).toBe(true));

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
    await waitFor(() => expect(result.current.supervisorModeEnabled).toBe(true));

    expect(result.current.supervisorActive).toBe(true);
    expect(result.current.supervisorSession?.sessionId).toBe(7);
  });
});

describe('useSupervisor — auditoría de cierre', () => {
  it('cierre manual (clearSupervisor) audita motivo=manual con el sessionId real', async () => {
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.supervisorModeEnabled).toBe(true));
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
    await waitFor(() => expect(result.current.supervisorModeEnabled).toBe(true));

    expect(result.current.supervisorActive).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/supervisor-log/cerrar', { sessionId: 99, motivo: 'expiracion' });
  });

  it('sesión sin sessionId (dato viejo, previo a este cambio): cierra local sin llamar al backend', async () => {
    const { result } = renderHook(() => useSupervisor(), { wrapper });
    await waitFor(() => expect(result.current.supervisorModeEnabled).toBe(true));
    act(() => { result.current.resolveModal(true, 'Ana Supervisor', 'admin', null); });

    act(() => { result.current.clearSupervisor(); });

    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
