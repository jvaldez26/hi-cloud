import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompraFormInner from './CompraFormInner';

/**
 * Regresión del mismo bug que en Factura (2026-10-01): IndexedDB usa
 * structured clone, que le quita el prototipo a un dayjs. El DatePicker
 * revienta al RENDERIZAR con ese valor, no al leerlo — por eso este test
 * monta un <CompraFormInner> de verdad (no un mock del hook) y verifica que
 * tanto el DatePicker de "Fecha" como el texto derivado "Vence el..."
 * (que depende de esa misma fecha + diasCredito, un extra fuera del Form)
 * sobreviven el guardado/restauración sin correrse de día ni lanzar.
 *
 * El guardado/restauración de dayjs en sí ya está cubierto exhaustivamente
 * en useFormDraft.test.tsx (es la misma lógica genérica para cualquier
 * formulario) — este test cubre lo que SÍ es específico de Compra:
 * fechaVencimientoCalc, derivada dentro de CompraFormInner y no exportada.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../../api/client', () => ({ default: apiMock }));

const comprasApiMock = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  getOne: vi.fn(),
  previsualizarAsiento: vi.fn().mockResolvedValue({}),
  porClave: vi.fn().mockResolvedValue({ existe: false }),
}));
vi.mock('../../api/compras.api', () => ({ comprasApi: comprasApiMock }));

beforeEach(() => {
  vi.clearAllMocks();
  comprasApiMock.porClave.mockResolvedValue({ existe: false });
  apiMock.get.mockImplementation((url: string) => {
    if (url.startsWith('/proveedores'))         return Promise.resolve({ data: { data: [] } });
    if (url.startsWith('/almacenes'))           return Promise.resolve({ data: { data: [] } });
    if (url === '/auth/mis-sucursales')         return Promise.resolve({ data: { data: [] } });
    if (/^\/productos\/\d+$/.test(url))         return Promise.resolve({ data: { data: { id: 1, nombre: 'Producto de prueba', codigo: 'P1', precio: 100, porcentajeIva: 18, tipo: 'producto' } } });
    if (url.startsWith('/productos'))           return Promise.resolve({ data: { data: [] } });
    if (url.startsWith('/preferencias/columnas')) return Promise.resolve({ data: { data: { porDefecto: true, ocultas: [], mostradas: [] } } });
    return Promise.resolve({ data: { data: [] } });
  });
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CompraFormInner />
    </QueryClientProvider>,
  );
}

const nuevoUsuario = () => userEvent.setup({ delay: null });

async function escribirFecha(user: ReturnType<typeof userEvent.setup>, ddmmaaaa: string) {
  const input = screen.getByLabelText('Fecha') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, ddmmaaaa);
  await user.keyboard('{Enter}');
}

describe('CompraFormInner — fecha (dayjs) sobrevive el guardado/restauración del borrador', () => {
  it('guarda y restaura la Fecha y recalcula "Vence el..." sin correr el día ni lanzar al renderizar', async () => {
    const user = nuevoUsuario();
    const { unmount } = montar();

    await screen.findByLabelText('Fecha');
    await escribirFecha(user, '30/09/2026');

    // Tipo de pago → Crédito, para que "Vence el..." (fechaVencimientoCalc,
    // depende de fecha + diasCredito) se calcule y se muestre. Es un Select
    // controlado SIN `name` (no registrado en el Form), así que no tiene
    // `for`/id asociado a su label — se abre por el texto de la opción
    // actual, como haría alguien con el mouse.
    await user.click(screen.getByText('Contado'));
    const opcionCredito = await screen.findByTitle('Crédito');
    await user.click(opcionCredito);
    const diasInput = screen.getByDisplayValue('30') as HTMLInputElement; // default de diasCredito
    await user.clear(diasInput);
    await user.type(diasInput, '45');

    // Confirma la interacción en sí antes de meter IndexedDB/unmount en la ecuación.
    expect(await screen.findByText(/Vence el/)).toBeInTheDocument();

    // Esperar el autoguardado debounced (1s) — se dispara por onValuesChange
    // del Form (fecha es un campo real del Form; tipoPago/diasCredito son
    // extra y viajan en el mismo snapshot aunque no disparen el guardado
    // por sí solos).
    await new Promise(res => setTimeout(res, 1300));

    unmount();

    const { unmount: unmount2 } = montar();
    await screen.findByText(/Tienes un borrador sin guardar de/);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Restaurar' }));
      await Promise.resolve();
    });

    const fechaRestaurada = screen.getByLabelText('Fecha') as HTMLInputElement;
    expect(fechaRestaurada.value).toBe('30/09/2026'); // el día NO se corrió

    expect(await screen.findByText(/Vence el/)).toBeInTheDocument();
    expect(screen.getByText('14/11/2026', { exact: false })).toBeInTheDocument(); // 30/09 + 45 días
    expect(screen.getByText(/\(45 días\)/)).toBeInTheDocument();

    unmount2();
    // Timeout individual ampliado a 60s (default 30s): monta <CompraFormInner>
    // completo DOS veces con antd real; en ~20-22s aislado, pero bajo la
    // contención de la suite completa (misma familia de caso que el test
    // lento de NC-compras, ver memoria del proyecto) puede pasar de 30s.
    // No se tocó el timeout global del archivo/proyecto.
  }, 60_000);
});
