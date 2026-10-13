import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DetallePrestamo from './DetallePrestamo';

/**
 * Cubre el frontend de Etapa 2 (resto) §1-3 — el backend ya existía y tenía
 * tests propios (pagos-anulacion.spec.ts, garantes.service.spec.ts,
 * garantias-ciclo-vida.spec.ts); esto solo verifica que la pantalla llame a
 * los endpoints correctos con el payload correcto, no vuelve a probar las
 * reglas de negocio del servidor.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: '' } }));
vi.mock('../../api/client', () => ({ default: apiMock }));

const PRESTAMO = {
  id: 5, numero: 'PR-00005', estado: 'al_dia', deudorId: 9, deudorNombre: 'Juan Pérez',
  productoNombre: 'Préstamo Personal', metodoAmortizacion: 'frances', tasaInteresMensual: 2,
  plazoMeses: 12, frecuenciaPago: 'mensual', cuotaPeriodica: 1000, montoPrincipal: 10000,
  saldoCapital: 8000, saldoInteres: 200, saldoMora: 0, saldoTotal: 8200,
  fechaDesembolso: '2026-01-01', fechaPrimerPago: '2026-02-01', fechaVencimiento: '2027-01-01',
  totalPagado: 2000, totalInteresPagado: 400, totalMoraPagada: 0, cuotas: [],
};

const PAGO_ACTIVO = {
  id: 77, numero: 'PAGO-00077', fecha: '2026-03-01', montoPagado: 1000,
  aplicadoCapital: 800, aplicadoInteres: 200, aplicadoMora: 0, metodoPago: 'efectivo', estado: 'activo',
};

const GARANTIA_ACTIVA = { id: 30, tipo: 'vehiculo', descripcion: 'Camioneta 2020', valorTasado: 500000, estado: 'activa', fechaTasacion: '2026-01-01' };

const GARANTE_ACTIVO = { id: 40, nombre: 'María Soporte', cedula: '001-0000000-0', telefono: '809-000-0000', relacionDeudor: 'Hermana', ingresoMensual: 30000, estado: 'activo' };

function montar() {
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

function mockGetDefault(pagos: any[], garantias: any[], garantes: any[]) {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/prestamista/prestamos/5') return Promise.resolve({ data: { data: PRESTAMO } });
    if (url === '/prestamista/pagos/prestamo/5') return Promise.resolve({ data: { data: pagos } });
    if (url === '/prestamista/garantias/prestamo/5') return Promise.resolve({ data: { data: garantias } });
    if (url === '/prestamista/garantes/prestamo/5') return Promise.resolve({ data: { data: garantes } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.post.mockResolvedValue({ data: { data: {} } });
  apiMock.patch.mockResolvedValue({ data: { data: {} } });
});

describe('DetallePrestamo — Anular pago (§1)', () => {
  it('pide un motivo y llama PATCH /prestamista/pagos/:id/anular con el motivo', async () => {
    mockGetDefault([PAGO_ACTIVO], [], []);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Pagos/ }));
    await user.click(await screen.findByRole('button', { name: 'Anular' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Error al registrar el monto');
    await user.click(within(dialog).getByRole('button', { name: 'Anular Pago' }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      '/prestamista/pagos/77/anular', { motivo: 'Error al registrar el monto' },
    ));
  });

  it('un pago ya anulado no muestra el botón Anular', async () => {
    mockGetDefault([{ ...PAGO_ACTIVO, estado: 'anulado' }], [], []);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Pagos/ }));
    await screen.findByText('PAGO-00077');
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument();
  });

  // Etapa 6 (Seguridad): pagos.service.ts ya graba anuladoPorNombre/anuladoEn/
  // motivoAnulacion al anular — esta pantalla nunca lo mostraba, solo la
  // etiqueta roja "anulado" sin decir quién ni por qué.
  it('un pago anulado muestra quién lo anuló y el motivo en un tooltip sobre el estado', async () => {
    mockGetDefault([{
      ...PAGO_ACTIVO, estado: 'anulado',
      anuladoPorNombre: 'Jean Admin', anuladoEn: '2026-03-02T10:00:00.000Z', motivoAnulacion: 'Cajera registró el monto equivocado',
    }], [], []);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Pagos/ }));
    const tag = await screen.findByText('anulado');
    await user.hover(tag);

    await waitFor(() => expect(screen.getByText(/Jean Admin/)).toBeInTheDocument());
    expect(screen.getByText(/Cajera registró el monto equivocado/)).toBeInTheDocument();
  });
});

describe('DetallePrestamo — Garantes (§2)', () => {
  it('crea un garante con POST /prestamista/garantes incluyendo el prestamoId', async () => {
    mockGetDefault([], [], []);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Garantes/ }));
    await user.click(await screen.findByRole('button', { name: 'Agregar Garante' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'María Soporte');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
      '/prestamista/garantes', expect.objectContaining({ prestamoId: 5, nombre: 'María Soporte' }),
    ));
  });

  it('libera un garante con PATCH /prestamista/garantes/:id/liberar (motivo opcional)', async () => {
    mockGetDefault([], [], [GARANTE_ACTIVO]);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Garantes/ }));
    await user.click(await screen.findByRole('button', { name: 'Liberar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Liberar' }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      '/prestamista/garantes/40/liberar', { motivo: undefined },
    ));
  });

  // Etapa 6 (Seguridad): garantes.service.ts ya graba liberadoPorNombre/
  // liberadoEn/motivoLiberacion — esta pantalla nunca lo mostraba.
  it('un garante liberado muestra quién lo liberó y el motivo en un tooltip', async () => {
    mockGetDefault([], [], [{
      ...GARANTE_ACTIVO, estado: 'liberado',
      liberadoPorNombre: 'Jean Admin', liberadoEn: '2026-04-01T09:00:00.000Z', motivoLiberacion: 'Préstamo pagado en su totalidad',
    }]);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Garantes/ }));
    const tag = await screen.findByText('liberado');
    await user.hover(tag);

    await waitFor(() => expect(screen.getByText(/Jean Admin/)).toBeInTheDocument());
    expect(screen.getByText(/Préstamo pagado en su totalidad/)).toBeInTheDocument();
  });
});

describe('DetallePrestamo — Ciclo de vida de garantías (§3)', () => {
  it('libera una garantía con PATCH /prestamista/garantias/:id/liberar', async () => {
    mockGetDefault([], [GARANTIA_ACTIVA], []);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Garantías/ }));
    await user.click(await screen.findByRole('button', { name: 'Liberar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Liberar' }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      '/prestamista/garantias/30/liberar', { motivo: undefined },
    ));
  });

  it('ejecutar exige un motivo y llama PATCH /prestamista/garantias/:id/ejecutar', async () => {
    mockGetDefault([], [GARANTIA_ACTIVA], []);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Garantías/ }));
    await user.click(await screen.findByRole('button', { name: 'Ejecutar' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Motivo de la ejecución'), 'Deudor incumplió 6 cuotas consecutivas');
    await user.click(within(dialog).getByRole('button', { name: 'Ejecutar Garantía' }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      '/prestamista/garantias/30/ejecutar', { motivo: 'Deudor incumplió 6 cuotas consecutivas' },
    ));
  });

  // Etapa 6 (Seguridad): garantias.service.ts ya graba cambiadoPorNombre/
  // motivoCambioEstado/fechaEjecucion al ejecutar — esta pantalla nunca lo
  // mostraba, solo la etiqueta roja "ejecutada".
  it('una garantía ejecutada muestra quién la ejecutó y el motivo en un tooltip', async () => {
    mockGetDefault([], [{
      ...GARANTIA_ACTIVA, estado: 'ejecutada',
      cambiadoPorNombre: 'Jean Admin', fechaEjecucion: '2026-05-01T08:00:00.000Z', motivoCambioEstado: 'Impago de 6 meses',
    }], []);
    const user = nuevoUsuario();
    montar();

    await user.click(await screen.findByRole('tab', { name: /Garantías/ }));
    const tag = await screen.findByText('ejecutada');
    await user.hover(tag);

    await waitFor(() => expect(screen.getByText(/Jean Admin/)).toBeInTheDocument());
    expect(screen.getByText(/Impago de 6 meses/)).toBeInTheDocument();
  });
});
