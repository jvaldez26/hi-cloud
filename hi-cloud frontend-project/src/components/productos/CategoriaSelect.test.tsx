import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CategoriaSelect from './CategoriaSelect';

/**
 * Selector de categoría de producto — catálogo real, no texto libre.
 * Cubre lo que pidió el usuario explícitamente: "crear categoría desde el
 * selector con y sin permiso". ADMIN/CONTADOR ven "+ Nueva categoría";
 * VENDEDOR/VIEWER solo pueden elegir entre las que ya existen.
 */

const authStoreMock = vi.hoisted(() => vi.fn());
vi.mock('../../store/auth.store', () => ({ useAuthStore: authStoreMock }));

const listarMock = vi.hoisted(() => vi.fn());
const crearMock  = vi.hoisted(() => vi.fn());
vi.mock('../../api/categoriasProducto.api', () => ({
  categoriasProductoApi: { listar: listarMock, crear: crearMock },
}));

function montar(role: string) {
  authStoreMock.mockImplementation((selector: any) => selector({ user: { role } }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <CategoriaSelect onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange };
}

async function abrirDropdown() {
  const combo = screen.getByRole('combobox');
  fireEvent.mouseDown(combo);
  await waitFor(() => expect(document.querySelector('.ant-select-dropdown')).toBeInTheDocument());
}

describe('CategoriaSelect — crear categoría con y sin permiso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listarMock.mockResolvedValue([
      { id: 1, nombre: 'Lácteos', descripcion: null, categoriaPadreId: null, categoriaPadreNombre: null, ruta: 'Lácteos', isActive: true },
    ]);
  });

  it('ADMIN ve "+ Nueva categoría" y puede crear una', async () => {
    const user = userEvent.setup({ delay: null });
    crearMock.mockResolvedValue({ id: 2, nombre: 'Congelados', descripcion: null, categoriaPadreId: null, categoriaPadreNombre: null, ruta: 'Congelados', isActive: true });
    const { onChange } = montar('admin');
    await abrirDropdown();

    expect(screen.getByText('Nueva categoría')).toBeInTheDocument();
    await user.click(screen.getByText('Nueva categoría'));

    await screen.findByText('Nueva categoría', { selector: '.ant-modal-title' });
    const input = await screen.findByPlaceholderText('Ej. Lácteos');
    await user.type(input, 'Congelados');
    const botonCrear = await screen.findByRole('button', { name: 'Crear' });
    await user.click(botonCrear);

    // Solo el primer argumento (el payload) — React Query v5 agrega un
    // segundo argumento de contexto interno a mutationFn que no es parte
    // del contrato de categoriasProductoApi.crear.
    await waitFor(() => expect(crearMock.mock.calls[0]?.[0]).toEqual({ nombre: 'Congelados', descripcion: undefined, categoriaPadreId: undefined }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(2));
  });

  it('CONTADOR también ve "+ Nueva categoría"', async () => {
    montar('contador');
    await abrirDropdown();
    expect(screen.getByText('Nueva categoría')).toBeInTheDocument();
  });

  it('VENDEDOR NO ve la opción de crear — solo puede elegir', async () => {
    montar('vendedor');
    await abrirDropdown();
    expect(screen.queryByText('Nueva categoría')).not.toBeInTheDocument();
    expect(await screen.findByText('Lácteos')).toBeInTheDocument();
  });

  it('VIEWER tampoco ve la opción de crear', async () => {
    montar('viewer');
    await abrirDropdown();
    expect(screen.queryByText('Nueva categoría')).not.toBeInTheDocument();
  });
});
