import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SelectClienteConAlta from './SelectClienteConAlta';

/**
 * Lo que se afirma aquí es la regla que da sentido al componente: con un RNC que
 * ya usa otro cliente, crear un duplicado tiene que ser una DECISIÓN, no un
 * descuido, y la razón social deja de ser opcional.
 *
 * Viene de un caso real: las escuelas de un distrito educativo facturan bajo el
 * RNC del distrito, el alta rápida no lo comprobaba, y tres clientes del RNC
 * 132269551 acabaron declarando tres razones sociales distintas a la DGII
 * porque el campo se dejó vacío y cayó al nombre interno.
 */

const clientesApiMock = vi.hoisted(() => ({
  list:          vi.fn(),
  buscarPorRnc:  vi.fn(),
  create:        vi.fn(),
  getOne:        vi.fn(),
}));
const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../api/clientes.api', () => ({ clientesApi: clientesApiMock }));
vi.mock('../../api/client',       () => ({ default: apiMock }));

const DOS_ESCUELAS = {
  rnc: '401500123',
  total: 2,
  clientes: [
    { id: 3, nombre: 'ESCUELA BÁSICA #3', razonSocial: 'DISTRITO EDUCATIVO 10-04',
      rfc: '401500123', direccion: 'C/ Duarte 12', ciudad: 'Los Alcarrizos' },
    { id: 4, nombre: 'ESCUELA BÁSICA #7', razonSocial: 'DISTRITO EDUCATIVO 10-04',
      rfc: '401500123', direccion: 'C/ Mella 45', ciudad: 'Los Alcarrizos' },
  ],
};

function montar(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SelectClienteConAlta {...props} />
    </QueryClientProvider>,
  );
}

/**
 * userEvent con delay a null: por defecto espera entre pulsación y pulsación, y
 * con antd cada tecla re-renderiza el Select entero — el suite pasaba de 55s.
 */
const nuevoUsuario = () => userEvent.setup({ delay: null });

/** Abre el modal de alta escribiendo un nombre que no existe */
async function abrirAlta(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox'));
  await user.type(screen.getByRole('combobox'), 'ESCUELA NUEVA');
  const crear = await screen.findByText(/como nuevo cliente/);
  await user.click(crear);
  await screen.findByText('Crear cliente rápido');
}

beforeEach(() => {
  vi.clearAllMocks();
  clientesApiMock.list.mockResolvedValue({
    data: [{ id: 1, nombre: 'FERRETERÍA LA ECONÓMICA', rfc: '131234567' }],
    meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
  });
  clientesApiMock.buscarPorRnc.mockResolvedValue({ rnc: '', total: 0, clientes: [] });
  apiMock.get.mockResolvedValue({ data: { data: { encontrado: false } } });
});

describe('SelectClienteConAlta — alta desde el buscador', () => {
  it('ofrece crear el cliente cuando lo tecleado no existe', async () => {
    const user = nuevoUsuario();
    montar();
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'CLIENTE QUE NO EXISTE');
    expect(await screen.findByText(/como nuevo cliente/)).toBeInTheDocument();
  });

  it('el modal pide los cinco campos del alta rápida', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirAlta(user);

    expect(screen.getByLabelText('RNC / Cédula')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre / Razón Social')).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Régimen Fiscal')).toBeInTheDocument();
  });

  it('con un RNC libre se puede crear sin más trámite', async () => {
    const user = nuevoUsuario();
    clientesApiMock.create.mockResolvedValue({ id: 99, nombre: 'ESCUELA NUEVA' });
    montar();
    await abrirAlta(user);

    await user.type(screen.getByLabelText('RNC / Cédula'), '131999888');
    await waitFor(() => expect(clientesApiMock.buscarPorRnc).toHaveBeenCalled());

    const crear = screen.getByRole('button', { name: /Crear y seleccionar/ });
    expect(crear).toBeEnabled();
  });
});

describe('SelectClienteConAlta — RNC que ya usa otro cliente', () => {
  beforeEach(() => {
    clientesApiMock.buscarPorRnc.mockResolvedValue(DOS_ESCUELAS);
  });

  it('avisa de cuántos hay y los enseña con su dirección', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirAlta(user);
    await user.type(screen.getByLabelText('RNC / Cédula'), '401500123');

    expect(await screen.findByText('Ya hay 2 clientes con ese RNC')).toBeInTheDocument();
    expect(screen.getByText('ESCUELA BÁSICA #3')).toBeInTheDocument();
    expect(screen.getByText('ESCUELA BÁSICA #7')).toBeInTheDocument();
    // La dirección es lo único que los distingue cuando comparten RNC y nombre
    expect(screen.getByText(/C\/ Duarte 12/)).toBeInTheDocument();
    expect(screen.getByText(/C\/ Mella 45/)).toBeInTheDocument();
  });

  it('NO deja crear el duplicado hasta decir que es un cliente distinto', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirAlta(user);
    await user.type(screen.getByLabelText('RNC / Cédula'), '401500123');
    await screen.findByText('Ya hay 2 clientes con ese RNC');

    // Esta es la regla: el camino natural es elegir uno de los que ya están
    expect(screen.getByRole('button', { name: /Crear y seleccionar/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /es un cliente distinto/ }));
    expect(screen.getByRole('button', { name: /Crear y seleccionar/ })).toBeEnabled();
  });

  it('exige la razón social, precargada con la del grupo', async () => {
    const user = nuevoUsuario();
    montar();
    await abrirAlta(user);
    await user.type(screen.getByLabelText('RNC / Cédula'), '401500123');
    await screen.findByText('Ya hay 2 clientes con ese RNC');

    // Ante la DGII un RNC identifica UN contribuyente: todos los que lo
    // comparten declaran la misma razón social.
    // El matcher va completo a propósito: "Nombre / Razón Social" también
    // contiene esas palabras y sin esto se enganchan los dos campos.
    const razon = await screen.findByLabelText(/Razón Social \(la que se declara/);
    expect(razon).toHaveValue('DISTRITO EDUCATIVO 10-04');
  });

  it('"Usar este" selecciona el cliente existente y no crea nada', async () => {
    const user = nuevoUsuario();
    const onChange = vi.fn();
    clientesApiMock.getOne.mockResolvedValue(DOS_ESCUELAS.clientes[0]);
    montar({ onChange });
    await abrirAlta(user);
    await user.type(screen.getByLabelText('RNC / Cédula'), '401500123');
    await screen.findByText('Ya hay 2 clientes con ese RNC');

    await user.click(screen.getAllByRole('button', { name: 'Usar este' })[0]);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(3));
    expect(clientesApiMock.create).not.toHaveBeenCalled();
  });

  it('con un solo cliente el aviso va en singular', async () => {
    clientesApiMock.buscarPorRnc.mockResolvedValue({
      ...DOS_ESCUELAS, total: 1, clientes: [DOS_ESCUELAS.clientes[0]],
    });
    const user = nuevoUsuario();
    montar();
    await abrirAlta(user);
    await user.type(screen.getByLabelText('RNC / Cédula'), '401500123');
    expect(await screen.findByText('Ya hay un cliente con ese RNC')).toBeInTheDocument();
  });
});
