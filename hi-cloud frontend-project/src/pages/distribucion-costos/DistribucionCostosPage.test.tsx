import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DistribucionCostosPage, { cuentasComoLista } from './DistribucionCostosPage';

/**
 * Incidente en producción (2026-09-24, empresa 77): abrir "Nueva regla" en
 * Distribución de Costos tumbaba la página con ".filter is not a function".
 *
 * Causa real: /contabilidad/cuentas devuelve `{ data: CuentaConAnexos[],
 * conteos }`, no un array pelado — exactamente lo que ya asumen
 * PlanCuentasPage, LibroMayorPage y CuentaContableSelector vía
 * contabilidadApi.cuentas(). Este componente tenía su PROPIO `api.get` con
 * un solo nivel de desenvuelto (el del interceptor global) y le faltaba el
 * segundo — `cuentas` llegaba siendo el objeto `{data, conteos}` completo,
 * nunca el array, en CUALQUIER empresa, no solo con catálogo vacío.
 *
 * cuentasComoLista() es la función que corrige la causa (usa la forma real
 * de la respuesta) Y protege contra cualquier otra forma inesperada — un
 * array.isArray de más nunca hace daño, pero no sustituye entender qué
 * devuelve el endpoint.
 */

describe('cuentasComoLista — las cuatro formas que un queryFn puede devolver', () => {
  it('la forma real y esperada: { data: [...], conteos: {...} }', () => {
    const cuentas = [{ id: 1, codigo: '1.1.1', nombre: 'Caja', permiteMovimientos: true }];
    expect(cuentasComoLista({ data: cuentas, conteos: {} })).toEqual(cuentas);
  });

  it('un objeto sin la forma esperada (el bug real): no revienta, devuelve []', () => {
    expect(cuentasComoLista({ algo: 'inesperado' })).toEqual([]);
  });

  it('null: no revienta, devuelve []', () => {
    expect(cuentasComoLista(null)).toEqual([]);
  });

  it('undefined (antes de que la query resuelva): no revienta, devuelve []', () => {
    expect(cuentasComoLista(undefined)).toEqual([]);
  });

  it('array vacío ya desenvuelto: se respeta tal cual', () => {
    expect(cuentasComoLista({ data: [], conteos: {} })).toEqual([]);
  });
});

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('../../api/client', () => ({ default: apiMock }));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DistribucionCostosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DistribucionCostosPage — el modal "Nueva regla" no revienta sin importar la forma de /contabilidad/cuentas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/distribucion-costos') return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('respuesta que NO es { data: [...] } (el bug real): el modal abre y no queda vacío el árbol', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/distribucion-costos')  return Promise.resolve({ data: { data: [] } });
      if (url === '/contabilidad/cuentas') return Promise.resolve({ data: { data: { algoQueNoEsElArray: true } } });
      return Promise.resolve({ data: { data: [] } });
    });
    const user = userEvent.setup({ delay: null });
    montar();

    await user.click(await screen.findByRole('button', { name: /Nueva regla/ }));
    expect(await screen.findByText('Nueva Regla de Distribución')).toBeInTheDocument();
    // El selector de cuenta origen sigue ahí, sin opciones — no una pantalla rota.
    expect(screen.getByText('Cuenta origen (se acredita al distribuir)')).toBeInTheDocument();
  });

  it('respuesta null: el modal abre igual', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/distribucion-costos')  return Promise.resolve({ data: { data: [] } });
      if (url === '/contabilidad/cuentas') return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: { data: [] } });
    });
    const user = userEvent.setup({ delay: null });
    montar();

    await user.click(await screen.findByRole('button', { name: /Nueva regla/ }));
    expect(await screen.findByText('Nueva Regla de Distribución')).toBeInTheDocument();
  });
});
