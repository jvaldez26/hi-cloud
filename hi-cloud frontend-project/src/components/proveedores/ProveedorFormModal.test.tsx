import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProveedorFormModal from './ProveedorFormModal';

/**
 * Pedido explícito (Directorio de HiCloud Xlink, "Crear" de proveedor):
 * - abre el MISMO formulario de Proveedores, prellenado con nombre/RNC de la
 *   contraparte, y no persiste nada hasta guardar (ni al abrir ni al cancelar);
 * - al guardar, crea el proveedor Y lo vincula a Xlink en la misma operación;
 * - si mientras tanto ya existe un proveedor sin vincular con ese RNC, ofrece
 *   "¿Vincularlo?" en vez de duplicarlo.
 */

const proveedoresApiMock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
const xlinkApiMock = vi.hoisted(() => ({ vincular: vi.fn() }));
const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../api/proveedores.api', () => ({ proveedoresApi: proveedoresApiMock }));
vi.mock('../../api/xlink.api', () => ({ xlinkApi: xlinkApiMock }));
vi.mock('../../api/client', () => ({ default: apiMock }));

function montar(props: Partial<React.ComponentProps<typeof ProveedorFormModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <ProveedorFormModal open onClose={onClose} onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose, onSaved };
}

const nuevoUsuario = () => userEvent.setup({ delay: null });

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockResolvedValue({ data: { data: { encontrado: false } } });
});

describe('ProveedorFormModal — modo normal (página Proveedores)', () => {
  it('crear llama a proveedoresApi.create, nunca a xlinkApi.vincular', async () => {
    const user = nuevoUsuario();
    proveedoresApiMock.create.mockResolvedValue({ id: 10, nombre: 'Mi Proveedor' });
    const { onSaved, onClose } = montar();

    await user.type(screen.getByLabelText('Nombre / Razón Social'), 'Mi Proveedor');
    await user.type(screen.getByLabelText('RNC'), '130000001');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    await waitFor(() => expect(proveedoresApiMock.create).toHaveBeenCalled());
    expect(xlinkApiMock.vincular).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith({ id: 10, nombre: 'Mi Proveedor' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ProveedorFormModal — "Crear" desde el Directorio de HiCloud Xlink (xlinkId)', () => {
  const XLINK_ID = '11111111-1111-1111-1111-111111111111';
  const initialValues = { nombre: 'Empresa Contraparte SRL', rnc: '130000001' };

  it('abre prellenado con nombre/RNC y el RNC queda bloqueado', () => {
    montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    expect(screen.getByLabelText('Nombre / Razón Social')).toHaveValue('Empresa Contraparte SRL');
    const rncInput = screen.getByLabelText('RNC');
    expect(rncInput).toHaveValue('130000001');
    expect(rncInput).toBeDisabled();
  });

  it('no persiste nada con solo abrir el formulario', () => {
    montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });
    expect(proveedoresApiMock.create).not.toHaveBeenCalled();
    expect(xlinkApiMock.vincular).not.toHaveBeenCalled();
  });

  it('cancelar no crea ni vincula nada', async () => {
    const user = nuevoUsuario();
    const { onClose } = montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(proveedoresApiMock.create).not.toHaveBeenCalled();
    expect(xlinkApiMock.vincular).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('guardar crea el proveedor y lo vincula a Xlink en una sola operación', async () => {
    const user = nuevoUsuario();
    xlinkApiMock.vincular.mockResolvedValue({ accion: 'creado', registro: { id: 20, nombre: 'Empresa Contraparte SRL' } });
    const { onSaved, onClose } = montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    await user.click(screen.getByRole('button', { name: 'Crear y vincular' }));

    await waitFor(() => expect(xlinkApiMock.vincular).toHaveBeenCalledWith(
      XLINK_ID, 'proveedor', expect.objectContaining({ nombre: 'Empresa Contraparte SRL' }),
    ));
    // El RNC lo decide el backend (empresa de xlinkId), nunca el formulario —
    // ni siquiera se manda, para que forbidNonWhitelisted no lo use de más.
    expect(xlinkApiMock.vincular.mock.calls[0][2]).not.toHaveProperty('rnc');
    expect(proveedoresApiMock.create).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith({ id: 20, nombre: 'Empresa Contraparte SRL' });
    expect(onClose).toHaveBeenCalled();
  });

  it('RNC que ya usa un proveedor sin vincular: ofrece "¿Vincularlo?" en vez de duplicarlo', async () => {
    const user = nuevoUsuario();
    xlinkApiMock.vincular.mockResolvedValueOnce({ accion: 'requiere_confirmacion', existente: { id: 7, nombre: 'Proveedor Ya Existente' } });
    const { onSaved, onClose } = montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    await user.click(screen.getByRole('button', { name: 'Crear y vincular' }));

    expect(await screen.findByText(/Ya existe "Proveedor Ya Existente" con este RNC/)).toBeInTheDocument();
    // Todavía no se creó ni vinculó nada — se está pidiendo confirmación.
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    xlinkApiMock.vincular.mockResolvedValueOnce({ id: 7, nombre: 'Proveedor Ya Existente' });
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    // El segundo llamado confirma SIN `datos` — el camino de vincular de un clic.
    await waitFor(() => expect(xlinkApiMock.vincular).toHaveBeenLastCalledWith(XLINK_ID, 'proveedor'));
    expect(onSaved).toHaveBeenCalledWith({ id: 7, nombre: 'Proveedor Ya Existente' });
    expect(onClose).toHaveBeenCalled();
  });

  it('en la alerta de confirmación, "Cancelar" solo cierra la alerta — no el formulario', async () => {
    const user = nuevoUsuario();
    xlinkApiMock.vincular.mockResolvedValueOnce({ accion: 'requiere_confirmacion', existente: { id: 7, nombre: 'Proveedor Ya Existente' } });
    const { onClose } = montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    await user.click(screen.getByRole('button', { name: 'Crear y vincular' }));
    await screen.findByText(/Ya existe "Proveedor Ya Existente"/);

    // El Alert se renderiza ANTES que el Form en el JSX, así que su botón
    // "Cancelar" es el primero del DOM — el segundo es el de pie de formulario.
    await user.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);

    expect(screen.queryByText(/Ya existe "Proveedor Ya Existente"/)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(xlinkApiMock.vincular).toHaveBeenCalledTimes(1);
  });
});
