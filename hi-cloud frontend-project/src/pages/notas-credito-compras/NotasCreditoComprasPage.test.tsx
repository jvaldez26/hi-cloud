import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import NotasCreditoComprasPage from './NotasCreditoComprasPage';

/**
 * Lo que se afirma aquí: el "Tipo de NC" no es un select decorativo — cambia
 * qué pide el formulario (Cantidad visible/oculta, OC obligatoria u
 * opcional) y, al cambiar, limpia los campos que dejaron de aplicar. Sin
 * esto, una NC que empezó como "devolución" vinculada a una OC podía
 * terminar guardándose como "ajuste sin devolución" con un compraDetalleId
 * y una cantidad que ya no significan nada (o, al revés, un ajuste que
 * cambia a devolución sin haber cargado ítems de ninguna OC).
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../../api/client', () => ({ default: apiMock }));
vi.mock('../../utils/exportExcel', () => ({ exportarExcel: vi.fn() }));

const PROVEEDORES = [{ id: 1, nombre: 'Suplidora ABC' }];
const COMPRAS_PROVEEDOR = [{ id: 55, folio: 'COM-202509-0001', total: 1180 }];

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotasCreditoComprasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const nuevoUsuario = () => userEvent.setup({ delay: null });

// El modal completo (Card + Table + Modal + Form.List) es pesado de montar
// en jsdom — el default de 10s del proyecto no alcanza para los casos que
// abren el modal y además interactúan con dos Selects encadenados.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockImplementation((url: string) => {
    if (url.startsWith('/proveedores'))            return Promise.resolve({ data: { data: PROVEEDORES } });
    if (url.startsWith('/productos'))               return Promise.resolve({ data: { data: [] } });
    if (url === '/notas-credito-compras/resumen')    return Promise.resolve({ data: { data: [] } });
    if (url.startsWith('/notas-credito-compras'))    return Promise.resolve({ data: { data: { data: [] } } });
    if (url.startsWith('/compras?proveedorId'))      return Promise.resolve({ data: { data: COMPRAS_PROVEEDOR } });
    return Promise.resolve({ data: { data: [] } });
  });
});

async function abrirModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Nueva NC Compra/ }));
  await screen.findByText('Nueva NC de Compra — Devolución a Proveedor');
}

async function elegirEnSelect(user: ReturnType<typeof userEvent.setup>, etiqueta: string, opcion: string) {
  await user.click(screen.getByLabelText(etiqueta));
  const opt = await screen.findByTitle(opcion);
  await user.click(opt);
}

describe('NotasCreditoComprasPage — Tipo de NC', () => {
  it('por defecto es "Devolución con reversa de inventario" y pide OC + Cantidad', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirModal(user);

    expect(screen.getByText('Devolución con reversa de inventario')).toBeInTheDocument();
    expect(screen.getByText(/La mercancía SÍ entró y SÍ se devuelve físicamente/)).toBeInTheDocument();
    // Placeholder de un Select antd: es el texto del span
    // .ant-select-selection-placeholder, no un atributo `placeholder` real.
    expect(screen.getByText('Elige un proveedor primero')).toBeInTheDocument();
  });

  it('cambiar a "Ajuste sin devolución física" oculta Cantidad y ya no exige OC', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirModal(user);

    await elegirEnSelect(user, 'Tipo de NC', 'Ajuste sin devolución física');

    expect(screen.getByText(/No toca inventario — solo el monto del ajuste/)).toBeInTheDocument();
    // El placeholder de Cantidad ya no está — la columna se oculta para este tipo.
    expect(screen.queryByPlaceholderText('Cant.')).not.toBeInTheDocument();
    // El campo de monto sigue ahí, pero relabeled.
    expect(screen.getByPlaceholderText('Monto')).toBeInTheDocument();
  });

  it('elegir una OC y luego cambiar de tipo limpia la OC elegida (los topes de cantidad ya no aplican)', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirModal(user);

    await elegirEnSelect(user, 'Proveedor', 'Suplidora ABC');

    // Confirma que el Select ya está habilitado (el placeholder cambió) antes
    // de interactuar — el span del placeholder tiene pointer-events:none, así
    // que el clic real va al input de búsqueda, no al texto.
    await screen.findByText('Buscar OC...');
    await user.click(screen.getByLabelText('OC Original'));
    const opcionOC = await screen.findByText(/COM-202509-0001/);
    await user.click(opcionOC);
    await user.keyboard('{Escape}'); // cierra el dropdown de la OC antes de tocar otro Select

    // El dropdown cerrado puede dejar su opción montada (oculta) en el DOM —
    // lo que importa es que haya AL MENOS una: la del valor seleccionado.
    expect(screen.getAllByText(/COM-202509-0001/).length).toBeGreaterThan(0);

    // Cambiar a "Mercancía no recibida" — sigue exigiendo OC, pero el tope
    // (pendiente, no recibido) es distinto: la OC elegida se limpia. El
    // dropdown ya cerrado de la OC anterior puede dejar su opción montada
    // (oculta) en el DOM — lo que de verdad prueba que el valor se limpió es
    // que el Select vuelva a mostrar su placeholder, no la ausencia total
    // del texto en el documento.
    await elegirEnSelect(user, 'Tipo de NC', 'Mercancía no recibida');

    expect(await screen.findByText('Buscar OC...')).toBeInTheDocument();
  });

  it('Motivo "Otro" exige descripción; los demás motivos no', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirModal(user);

    await elegirEnSelect(user, 'Motivo', 'Otro motivo');
    expect(screen.getByPlaceholderText('Obligatorio con "Otro motivo"')).toBeInTheDocument();

    await elegirEnSelect(user, 'Motivo', 'Descuento otorgado por proveedor');
    expect(screen.queryByPlaceholderText('Obligatorio con "Otro motivo"')).not.toBeInTheDocument();
  });
});
