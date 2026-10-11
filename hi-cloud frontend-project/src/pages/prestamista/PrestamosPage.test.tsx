import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PrestamosPage from './PrestamosPage';

/**
 * Etapa 5, Parte B — ver docs/prestamista/etapa-5-contabilidad-caja-fiscal.md.
 * CrearPrestamoDto nunca tuvo "formaPago" declarado (siempre se descartaba
 * por forbidNonWhitelisted) — este test cubre el campo nuevo y el selector
 * de caja que aparece solo cuando el desembolso inicial es en efectivo.
 * Mismo patrón de interacción con Select dentro de un Modal que
 * NotasCreditoComprasPage.test.tsx (getByLabelText + findByTitle).
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: '' } }));
vi.mock('../../api/client', () => ({ default: apiMock }));

const SOLICITUD = { id: 8, numero: 'SOL-00008', deudorNombre: 'Ana Pérez', montoAprobado: 5000 };
const CAJA_ABIERTA = { id: 4, vendedorNombre: 'Jean Cajero' };

function montar() {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/prestamista/prestamos')   return Promise.resolve({ data: { data: [] } });
    if (url === '/prestamista/solicitudes') return Promise.resolve({ data: { data: [SOLICITUD] } });
    if (url === '/caja/hoy')                return Promise.resolve({ data: { data: { cajas: [CAJA_ABIERTA] } } });
    return Promise.resolve({ data: { data: [] } });
  });
  apiMock.post.mockResolvedValue({ data: { data: { id: 99 } } });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/prestamista/prestamos']}>
        <PrestamosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function abrirModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Nuevo Préstamo/i }));
  await screen.findByText('Nuevo Préstamo (Desembolso)');
}

async function llenarFechas(user: ReturnType<typeof userEvent.setup>) {
  // El DatePicker usa format="YYYY-MM-DD" — escribir en otro formato lo deja vacío.
  await user.type(screen.getByLabelText('Fecha Desembolso'), '2026-08-01{Enter}');
  await user.type(screen.getByLabelText('Fecha Primer Pago'), '2026-09-01{Enter}');
}

async function elegirEnSelect(user: ReturnType<typeof userEvent.setup>, etiqueta: string, opcion: string | RegExp) {
  await user.click(screen.getByLabelText(etiqueta));
  // Las opciones con varios campos (ej. "SOL-00008 — Ana Pérez — RD$...")
  // no reciben `title` de antd — se busca por el texto real de la opción,
  // igual que lo ve el usuario.
  const [opt] = await screen.findAllByText(opcion);
  await user.click(opt);
}

const nuevoUsuario = () => userEvent.setup({ delay: null });
// Modal con dos Selects antd encadenados (forma de pago → caja) — mismo
// motivo que NotasCreditoComprasPage.test.tsx: 30s no alcanza bajo carga de
// máquina en la suite completa.
vi.setConfig({ testTimeout: 60_000 });

beforeEach(() => { vi.clearAllMocks(); });

describe('PrestamosPage — Nuevo Préstamo (Etapa 5, Parte B)', () => {
  it('por defecto (transferencia): no muestra el selector de caja ni manda cajaDiariaId', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirModal(user);

    expect(screen.queryByText('Caja de efectivo (opcional)')).not.toBeInTheDocument();

    await elegirEnSelect(user, 'Solicitud Aprobada', /SOL-00008/);
    await llenarFechas(user);
    await user.click(screen.getByRole('button', { name: 'Desembolsar' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
      '/prestamista/prestamos',
      expect.objectContaining({ solicitudId: 8, formaPago: 'transferencia' }),
    ));
    const [, body] = apiMock.post.mock.calls[0];
    expect(body.cajaDiariaId).toBeUndefined();
  });

  it('eligiendo efectivo: aparece el selector de caja y, al elegir una, se manda cajaDiariaId', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirModal(user);

    await elegirEnSelect(user, 'Forma del desembolso', 'Efectivo');
    await screen.findByText('Caja de efectivo (opcional)');
    await elegirEnSelect(user, 'Caja de efectivo (opcional)', /Jean Cajero — Caja #4/);

    await elegirEnSelect(user, 'Solicitud Aprobada', /SOL-00008/);
    await llenarFechas(user);
    await user.click(screen.getByRole('button', { name: 'Desembolsar' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
      '/prestamista/prestamos',
      expect.objectContaining({ formaPago: 'efectivo', cajaDiariaId: 4 }),
    ));
  });
});
