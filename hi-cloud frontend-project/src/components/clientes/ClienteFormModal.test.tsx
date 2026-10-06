import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ClienteFormModal from './ClienteFormModal';

/**
 * Pedido explícito (Directorio de HiCloud Xlink, "Crear" de cliente):
 * - abre el MISMO formulario de Clientes, prellenado con nombre/RNC de la
 *   contraparte, y no persiste nada hasta guardar (ni al abrir ni al cancelar);
 * - al guardar, crea el cliente Y lo vincula a Xlink en la misma operación;
 * - si mientras tanto ya existe un cliente sin vincular con ese RNC, ofrece
 *   "¿Vincularlo?" en vez de duplicarlo.
 */

const clientesApiMock = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), getOne: vi.fn(),
  buscarPorRnc: vi.fn().mockResolvedValue({ rnc: '', total: 0, clientes: [] }),
}));
const xlinkApiMock = vi.hoisted(() => ({ vincular: vi.fn() }));
const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../api/clientes.api', () => ({ clientesApi: clientesApiMock }));
vi.mock('../../api/xlink.api', () => ({ xlinkApi: xlinkApiMock }));
vi.mock('../../api/client', () => ({ default: apiMock }));

function montar(props: Partial<React.ComponentProps<typeof ClienteFormModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <ClienteFormModal open onClose={onClose} onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose, onSaved };
}

const nuevoUsuario = () => userEvent.setup({ delay: null });

beforeEach(() => {
  vi.clearAllMocks();
  clientesApiMock.buscarPorRnc.mockResolvedValue({ rnc: '', total: 0, clientes: [] });
  apiMock.get.mockResolvedValue({ data: { data: { encontrado: false } } });
});

describe('ClienteFormModal — modo normal (página Clientes)', () => {
  it('crear llama a clientesApi.create, nunca a xlinkApi.vincular', async () => {
    const user = nuevoUsuario();
    clientesApiMock.create.mockResolvedValue({ id: 10, nombre: 'Mi Cliente' });
    const { onSaved, onClose } = montar();

    await user.type(screen.getByLabelText('Nombre del cliente'), 'Mi Cliente');
    await user.type(screen.getByLabelText('RNC / Cédula'), '130000001');
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }));

    await waitFor(() => expect(clientesApiMock.create).toHaveBeenCalled());
    expect(xlinkApiMock.vincular).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith({ id: 10, nombre: 'Mi Cliente' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ClienteFormModal — "Crear" desde el Directorio de HiCloud Xlink (xlinkId)', () => {
  const XLINK_ID = '22222222-2222-2222-2222-222222222222';
  const initialValues = { nombre: 'Empresa Contraparte SRL', rfc: '130000002' };

  it('abre prellenado con nombre/RNC y el RNC queda bloqueado', () => {
    montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    expect(screen.getByLabelText('Nombre del cliente')).toHaveValue('Empresa Contraparte SRL');
    const rncInput = screen.getByLabelText('RNC / Cédula');
    expect(rncInput).toHaveValue('130000002');
    expect(rncInput).toBeDisabled();
  });

  it('no persiste nada con solo abrir el formulario', () => {
    montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });
    expect(clientesApiMock.create).not.toHaveBeenCalled();
    expect(xlinkApiMock.vincular).not.toHaveBeenCalled();
  });

  it('cancelar no crea ni vincula nada', async () => {
    const user = nuevoUsuario();
    const { onClose } = montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(clientesApiMock.create).not.toHaveBeenCalled();
    expect(xlinkApiMock.vincular).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('guardar crea el cliente y lo vincula a Xlink en una sola operación', async () => {
    const user = nuevoUsuario();
    xlinkApiMock.vincular.mockResolvedValue({ accion: 'creado', registro: { id: 20, nombre: 'Empresa Contraparte SRL' } });
    const { onSaved, onClose } = montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    await user.click(screen.getByRole('button', { name: 'Crear y vincular' }));

    await waitFor(() => expect(xlinkApiMock.vincular).toHaveBeenCalledWith(
      XLINK_ID, 'cliente', expect.objectContaining({ nombre: 'Empresa Contraparte SRL' }),
    ));
    // El RNC lo decide el backend (empresa de xlinkId), nunca el formulario —
    // ni siquiera se manda, para que forbidNonWhitelisted no lo use de más.
    expect(xlinkApiMock.vincular.mock.calls[0][2]).not.toHaveProperty('rfc');
    expect(clientesApiMock.create).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith({ id: 20, nombre: 'Empresa Contraparte SRL' });
    expect(onClose).toHaveBeenCalled();
  });

  it('RNC que ya usa un cliente sin vincular: ofrece "¿Vincularlo?" en vez de duplicarlo', async () => {
    const user = nuevoUsuario();
    xlinkApiMock.vincular.mockResolvedValueOnce({ accion: 'requiere_confirmacion', existente: { id: 7, nombre: 'Cliente Ya Existente' } });
    const { onSaved, onClose } = montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });

    await user.click(screen.getByRole('button', { name: 'Crear y vincular' }));

    expect(await screen.findByText(/Ya existe "Cliente Ya Existente" con este RNC/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    xlinkApiMock.vincular.mockResolvedValueOnce({ id: 7, nombre: 'Cliente Ya Existente' });
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(xlinkApiMock.vincular).toHaveBeenLastCalledWith(XLINK_ID, 'cliente'));
    expect(onSaved).toHaveBeenCalledWith({ id: 7, nombre: 'Cliente Ya Existente' });
    expect(onClose).toHaveBeenCalled();
  });

  it('no muestra la alerta normal de "RNC compartido" en modo Xlink (el RNC viene fijo, no se re-consulta al escribir)', () => {
    montar({ xlinkId: XLINK_ID, initialValues, rncLocked: true });
    expect(clientesApiMock.buscarPorRnc).not.toHaveBeenCalled();
  });
});

describe('ClienteFormModal — "Usar este" (modo normal) cambia el modal a edición sin cerrar ni guardar', () => {
  // Teclea dos campos letra por letra + resuelve varias queries encadenadas —
  // cómodo en ~6s en solitario, pero roza el timeout de 10s bajo carga (CI,
  // o corriendo junto a otras suites pesadas de antd). Mismo ajuste que el
  // resto del proyecto para tests RTL legítimamente lentos, no flaky.
  it('no llama a onSaved ni cierra el modal al elegir un cliente existente de la alerta', async () => {
    const user = nuevoUsuario();
    clientesApiMock.buscarPorRnc.mockResolvedValue({
      rnc: '130000003', total: 1,
      clientes: [{ id: 5, nombre: 'Cliente Existente', razonSocial: 'RS', rfc: '130000003', direccion: '', ciudad: '' }],
    });
    clientesApiMock.getOne.mockResolvedValue({ id: 5, nombre: 'Cliente Existente', rfc: '130000003' });
    const { onSaved, onClose } = montar();

    await user.type(screen.getByLabelText('Nombre del cliente'), 'Cliente Nuevo');
    await user.type(screen.getByLabelText('RNC / Cédula'), '130000003');
    await screen.findByText(/Ya existe 1 cliente con este RNC/);

    await user.click(screen.getByRole('button', { name: 'Usar este' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Editar cliente'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(clientesApiMock.create).not.toHaveBeenCalled();
  }, 20000);
});
