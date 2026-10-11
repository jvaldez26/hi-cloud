import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DetallePrestamo from './DetallePrestamo';

/**
 * Cubre el frontend de Etapa 2 (resto) §4-§6 — verifica que la pantalla
 * llame a los endpoints correctos con el payload correcto; las reglas de
 * negocio del servidor ya están cubiertas en sus specs propios
 * (desembolsos-parciales.service.spec.ts, reestructuracion.service.spec.ts,
 * condonacion.service.spec.ts).
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: '' } }));
vi.mock('../../api/client', () => ({ default: apiMock }));

const PRESTAMO_PARCIAL = {
  id: 5, numero: 'PR-00005', estado: 'desembolso_parcial', deudorId: 9, deudorNombre: 'Juan Pérez',
  productoNombre: 'Préstamo Personal', metodoAmortizacion: 'frances', tasaInteresMensual: 2,
  plazoMeses: 12, frecuenciaPago: 'mensual', cuotaPeriodica: 1000, montoPrincipal: 10000, desembolsado: 4000,
  saldoCapital: 10000, saldoInteres: 0, saldoMora: 0, saldoTotal: 10000,
  fechaDesembolso: '2026-01-01', fechaPrimerPago: '2026-02-01', fechaVencimiento: '2027-01-01',
  totalPagado: 0, totalInteresPagado: 0, totalMoraPagada: 0, cuotas: [],
};

const PRESTAMO_AL_DIA = { ...PRESTAMO_PARCIAL, estado: 'al_dia', desembolsado: 10000, saldoMora: 500, saldoInteres: 200 };

function montar(prestamo: any) {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/prestamista/prestamos/5') return Promise.resolve({ data: { data: prestamo } });
    return Promise.resolve({ data: { data: [] } });
  });
  apiMock.post.mockResolvedValue({ data: { data: {} } });
  apiMock.patch.mockResolvedValue({ data: { data: {} } });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/prestamista/prestamos/5']}>
        <Routes>
          <Route path="/prestamista/prestamos/:id" element={<DetallePrestamo />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const nuevoUsuario = () => userEvent.setup({ delay: null });
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => { vi.clearAllMocks(); });

describe('DetallePrestamo — Desembolsos parciales (§4)', () => {
  it('muestra el aviso de desembolso pendiente y registra un tramo con POST /prestamista/desembolsos-parciales', async () => {
    const user = nuevoUsuario();
    montar(PRESTAMO_PARCIAL);

    await screen.findByText(/Desembolso pendiente/);
    await user.click(await screen.findByRole('button', { name: 'Registrar Tramo' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Monto del tramo'), '3000');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
      '/prestamista/desembolsos-parciales',
      expect.objectContaining({ prestamoId: 5, monto: 3000 }),
    ));
  });

  it('con desembolso pendiente, no se puede Registrar Pago, Reestructurar ni Condonar', async () => {
    montar(PRESTAMO_PARCIAL);
    await screen.findByText(/Desembolso pendiente/);
    expect(screen.queryByRole('button', { name: 'Registrar Pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reestructurar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Condonar' })).not.toBeInTheDocument();
  });
});

describe('DetallePrestamo — Reestructuración (§5)', () => {
  it('exige un motivo y llama PATCH /prestamista/prestamos/:id/reestructurar', async () => {
    const user = nuevoUsuario();
    montar(PRESTAMO_AL_DIA);

    await user.click(await screen.findByRole('button', { name: 'Reestructurar' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nuevo plazo (cuotas restantes)'), '18');
    await user.type(within(dialog).getByLabelText('Motivo'), 'El deudor pidió extender el plazo');
    await user.click(within(dialog).getByRole('button', { name: 'Reestructurar' }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      '/prestamista/prestamos/5/reestructurar',
      expect.objectContaining({ nuevoPlazoMeses: 18, motivo: 'El deudor pidió extender el plazo' }),
    ));
  });
});

describe('DetallePrestamo — Condonación (§6)', () => {
  it('condona solo mora y llama PATCH /prestamista/prestamos/:id/condonar sin tocar capital', async () => {
    const user = nuevoUsuario();
    montar(PRESTAMO_AL_DIA);

    await user.click(await screen.findByRole('button', { name: 'Condonar' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Mora a condonar'), '500');
    await user.type(within(dialog).getByLabelText('Motivo'), 'Cliente de buena fe');
    await user.click(within(dialog).getByRole('button', { name: 'Condonar' }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      '/prestamista/prestamos/5/condonar',
      expect.objectContaining({ moraACondonar: 500, motivo: 'Cliente de buena fe' }),
    ));
    const body = apiMock.patch.mock.calls.find(([url]) => url === '/prestamista/prestamos/5/condonar')![1];
    expect(body.interesACondonar).toBeUndefined();
  });

  it('sin mora ni interés indicado, no llama al servidor', async () => {
    const user = nuevoUsuario();
    montar(PRESTAMO_AL_DIA);

    await user.click(await screen.findByRole('button', { name: 'Condonar' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Motivo'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Condonar' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(apiMock.patch).not.toHaveBeenCalledWith('/prestamista/prestamos/5/condonar', expect.anything());
  });
});
