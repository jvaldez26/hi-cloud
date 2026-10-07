import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSupervisor } from './useSupervisor';

/**
 * requireSupervisor() NUNCA debe decidir con el catálogo de políticas
 * todavía sin cargar. Caso real (2026-10-07): una empresa con el panel de
 * Inventario del POS en requerido=true — el cajero entraba al panel sin que
 * pidiera nada, porque lo tocaba justo después de cargar la página, antes
 * de que GET /configuracion/supervisor-politicas resolviera. El código viejo
 * leía el estado reactivo de useQuery directamente: con el catálogo todavía
 * vacío, "no hay política" se trataba igual que "no requerido" — fail open.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: apiMock }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/configuracion/empresa/pos-config') {
      return Promise.resolve({ data: { data: { maxDiscountPercent: 10 } } });
    }
    return Promise.reject(new Error(`sin mock para ${url}`));
  });
});

describe('useSupervisor — requireSupervisor() espera el catálogo antes de decidir', () => {
  it('una clave requerida=true que tarda en cargar SIGUE pidiendo autorización — no pasa libre', async () => {
    let resolverPoliticas!: (v: any) => void;
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/configuracion/empresa/pos-config') {
        return Promise.resolve({ data: { data: { maxDiscountPercent: 10 } } });
      }
      if (url === '/configuracion/supervisor-politicas') {
        // Simula una red lenta: la promesa no resuelve hasta que el test lo decida.
        return new Promise(resolve => { resolverPoliticas = resolve; });
      }
      return Promise.reject(new Error(`sin mock para ${url}`));
    });

    const { result } = renderHook(() => useSupervisor(), { wrapper });

    // requireSupervisor() se llama ANTES de que /supervisor-politicas resuelva
    // — el bug viejo devolvía { ok: true } al instante aquí mismo.
    let resuelto: any;
    act(() => {
      result.current.requireSupervisor('pos.panel.inventario', 'Inventario').then(r => { resuelto = r; });
    });

    // Mientras la política no llega, NO debe haberse resuelto como libre —
    // ni el modal debe seguir cerrado como si nada hiciera falta.
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(resuelto).toBeUndefined();

    // Ahora sí llega el catálogo: ESA clave está marcada requerida.
    act(() => {
      resolverPoliticas({
        data: {
          data: [
            { clave: 'pos.panel.inventario', label: 'Inventario', descripcion: '', grupo: 'Pestañas del POS', requerido: true, modo: 'sesion' },
          ],
        },
      });
    });

    await waitFor(() => expect(result.current.pendingAction).not.toBeNull());
    expect(result.current.pendingAction?.clave).toBe('pos.panel.inventario');
    expect(resuelto).toBeUndefined(); // sigue pendiente del modal — no se auto-resolvió
  });

  it('una clave con requerido=false (ya cargada) pasa libre, sin abrir el modal', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/configuracion/empresa/pos-config') return Promise.resolve({ data: { data: {} } });
      if (url === '/configuracion/supervisor-politicas') {
        return Promise.resolve({
          data: { data: [{ clave: 'pos.panel.inventario', label: 'Inventario', descripcion: '', grupo: '', requerido: false, modo: 'sesion' }] },
        });
      }
      return Promise.reject(new Error(`sin mock para ${url}`));
    });

    const { result } = renderHook(() => useSupervisor(), { wrapper });

    let resultado: any;
    await act(async () => {
      resultado = await result.current.requireSupervisor('pos.panel.inventario');
    });
    expect(resultado).toEqual({ ok: true });
    expect(result.current.pendingAction).toBeNull();
  });

  // Caso real (2026-10-07): GET /configuracion/supervisor-politicas era
  // ADMIN-only — un cajero (vendedor) recibía 403 ahí. requireSupervisor()
  // esperaba ese fetchQuery sin capturar el rechazo: el clic del panel se
  // quedaba "congelado" (la promesa nunca resolvía, setPanelActivo nunca se
  // llamaba). Fallar CERRADO (pedir el modal igual) es lo correcto —
  // silencioso tampoco sirve, eso fue el bug ANTERIOR a este mismo fix.
  it('si el catálogo de políticas falla (403, red caída) falla CERRADO — pide autorización, no se cuelga ni pasa libre', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/configuracion/empresa/pos-config') return Promise.resolve({ data: { data: {} } });
      if (url === '/configuracion/supervisor-politicas') {
        return Promise.reject({ response: { status: 403 } });
      }
      return Promise.reject(new Error(`sin mock para ${url}`));
    });

    const { result } = renderHook(() => useSupervisor(), { wrapper });

    let resuelto: any;
    await act(async () => {
      result.current.requireSupervisor('pos.panel.inventario', 'Inventario').then(r => { resuelto = r; });
    });

    // No se cuelga: el modal se abre de todos modos.
    expect(result.current.pendingAction).not.toBeNull();
    expect(result.current.pendingAction?.clave).toBe('pos.panel.inventario');
    expect(resuelto).toBeUndefined(); // pendiente del modal, no auto-resuelto como { ok: true }
  });
});
