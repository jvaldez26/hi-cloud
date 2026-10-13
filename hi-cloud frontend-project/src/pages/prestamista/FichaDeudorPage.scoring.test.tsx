import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FichaDeudorPage from './FichaDeudorPage';

/**
 * Etapa 7 — Scoring. Cubre dónde se muestra (ficha del deudor): el badge
 * aparece junto al nombre con el score y la banda, y al hacer click
 * despliega el desglose por factor — nunca un número sin poder auditar de
 * dónde salió. El motor de reglas en sí ya tiene su cobertura en
 * scoring.service.spec.ts (backend); esto solo verifica que la pantalla
 * pinte lo que el endpoint devuelve.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: '' } }));
vi.mock('../../api/client', () => ({ default: apiMock }));

const DEUDOR = {
  id: 9, numero: 'DEU-0009', nombre: 'Juan', apellidos: 'Pérez', nivelRiesgo: 'medio',
  enListaNegra: false, totalPrestado: 10000, totalPagado: 4000, prestamosActivos: 1,
  diasMoraHistorico: 0, prestamos: [],
};

const SCORE = {
  score: 72, banda: 'B', bandaEtiqueta: 'Bueno', sinHistorial: false,
  clienteDesde: '2024-01-01', alertaCambioPatron: true,
  alertaCambioPatronDetalle: 'Tiene buen historial de pago (90% a tiempo) pero está en mora ahora mismo (6 día(s)).',
  factores: [
    { factor: 'puntualidad', etiqueta: 'Puntualidad de pago', puntos: 27, max: 30, detalle: '9 de 10 cuotas pagadas a tiempo (90%).', sinDato: false },
    { factor: 'moraActual', etiqueta: 'Mora vigente', puntos: 14, max: 20, detalle: '6 día(s) de mora en el préstamo activo más atrasado.', sinDato: false },
    { factor: 'historial', etiqueta: 'Refinanciamientos y condonaciones previas', puntos: 25, max: 25, detalle: 'Sin refinanciamientos ni condonaciones en su historial.', sinDato: false },
    { factor: 'trayectoria', etiqueta: 'Trayectoria de préstamos cerrados', puntos: 6, max: 15, detalle: 'Todavía no cerró ningún préstamo — se asigna la mitad de los puntos hasta que termine uno.', sinDato: true },
    { factor: 'respaldo', etiqueta: 'Garantías y garantes activos', puntos: 0, max: 10, detalle: 'sin garantía activa, sin garante activo.', sinDato: false },
  ],
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/prestamista/deudores/9']}>
        <Routes>
          <Route path="/prestamista/deudores/:id" element={<FichaDeudorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const nuevoUsuario = () => userEvent.setup({ delay: null });
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/prestamista/deudores/9') return Promise.resolve({ data: { data: DEUDOR } });
    if (url === '/prestamista/deudores/9/score') return Promise.resolve({ data: { data: SCORE } });
    if (url === '/prestamista/garantias/deudor/9') return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
});

describe('FichaDeudorPage — badge de score (Etapa 7)', () => {
  it('muestra el badge con el score y la banda que devuelve el endpoint', async () => {
    montar();
    expect(await screen.findByText('Score: 72/100 (B)')).toBeInTheDocument();
  });

  it('al hacer click despliega el desglose de los 5 factores con sus puntos', async () => {
    montar();
    const badge = await screen.findByText('Score: 72/100 (B)');
    await nuevoUsuario().click(badge);

    await waitFor(() => expect(screen.getByText('Puntualidad de pago')).toBeInTheDocument());
    expect(screen.getByText('27/30')).toBeInTheDocument();
    expect(screen.getByText('9 de 10 cuotas pagadas a tiempo (90%).')).toBeInTheDocument();
    expect(screen.getByText('6/15 (estimado)')).toBeInTheDocument();
    expect(screen.getByText(/buen historial de pago/)).toBeInTheDocument();
  });

  it('no llama al endpoint de score si el deudor todavía no cargó', () => {
    montar();
    // El badge aparece con el nombre YA cargado — antes de eso no debe pedirse el score con un id inválido.
    expect(apiMock.get).not.toHaveBeenCalledWith('/prestamista/deudores/undefined/score');
  });
});
