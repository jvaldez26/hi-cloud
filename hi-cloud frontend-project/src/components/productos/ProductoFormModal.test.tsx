import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductoFormModal } from './ProductoFormModal';

/**
 * Formulario único de producto (2026-10-16) — mismo componente en
 * Inventario, POS, Compras y Xlink. Esta suite cubre lo que es puramente de
 * frontend: VENDEDOR nunca VE costo/precio2/precio3 (el backend también los
 * ignora si llegan igual — ver formulario-unico-producto.spec.ts en el
 * backend), y "modo rápido" muestra el subconjunto mínimo con el enlace
 * "Más campos" para expandir.
 */

const authStoreMock = vi.hoisted(() => vi.fn());
vi.mock('../../store/auth.store', () => ({ useAuthStore: authStoreMock }));

const useRolMock = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useCanDo', () => ({ useRol: useRolMock }));

vi.mock('../../hooks/useCatalogQueries', () => ({
  useSucursalesQuery: () => ({ data: [] }),
  useUomUnidadesQuery: () => ({ data: [] }),
}));
vi.mock('../../hooks/useProductoImagen', () => ({ useProductoImagen: () => ({ src: undefined }) }));
vi.mock('../ui/UomSelect', () => ({ UomSelect: (props: any) => <select data-testid="uom-select" {...props} /> }));
vi.mock('../../api/proveedores.api', () => ({ proveedoresApi: { list: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('../../api/productoProveedor.api', () => ({ productoProveedorApi: { porProducto: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/configuracion.api', () => ({
  configuracionApi: { getEmpresa: vi.fn().mockResolvedValue({ configuracion: {} }) },
}));
vi.mock('../../api/client', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));

function montar(props: Partial<React.ComponentProps<typeof ProductoFormModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ProductoFormModal open onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  authStoreMock.mockReturnValue({ sucursalActual: undefined, almacenActual: undefined, empresaActual: 53 });
});

describe('ProductoFormModal — VENDEDOR nunca ve costo/precio2/precio3', () => {
  it('VENDEDOR: el campo Costo no se renderiza', () => {
    useRolMock.mockReturnValue({ esVendedor: true });
    montar();
    expect(screen.queryByText(/^Costo$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Precio 2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Precio 3/)).not.toBeInTheDocument();
  });

  it('ADMIN: el campo Costo sí se renderiza', () => {
    useRolMock.mockReturnValue({ esVendedor: false });
    montar();
    expect(screen.getByText(/Costo/)).toBeInTheDocument();
  });
});

describe('ProductoFormModal — modo rápido vs completo', () => {
  it('modo rápido: no muestra Código, Stock ni Proveedor, y ofrece "Más campos"', () => {
    useRolMock.mockReturnValue({ esVendedor: false });
    montar({ modoInicial: 'rapido' });
    expect(screen.queryByText('Código')).not.toBeInTheDocument();
    expect(screen.queryByText('Proveedor principal')).not.toBeInTheDocument();
    expect(screen.getByText('Más campos →')).toBeInTheDocument();
  });

  it('modo completo: muestra Código y Proveedor, sin enlace "Más campos"', () => {
    useRolMock.mockReturnValue({ esVendedor: false });
    montar({ modoInicial: 'completo' });
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.queryByText('Más campos →')).not.toBeInTheDocument();
  });
});
