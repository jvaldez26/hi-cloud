import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SelectProductoBusqueda, { ordenarExactoPrimero, esCoincidenciaExacta } from './SelectProductoBusqueda';

/**
 * Caso real (2026-09-30): el modal "Registrar Entrada" de Inventario no
 * encontraba el producto 7465622022077 (MAGNIFIQUE PAN DE SANDWICH) al teclear
 * su código de barras — "No hay datos" — mientras el mismo producto sí salía en
 * el POS. Precargaba 2000 productos y filtraba en el cliente por la etiqueta
 * "codigo — nombre", donde el código de BARRAS no aparece.
 *
 * Lo que se afirma aquí es justo eso: quien filtra es el SERVIDOR, así que un
 * producto que queda fuera del primer lote se encuentra igual.
 */

const productosApiMock = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../api/productos.api', () => ({ productosApi: productosApiMock }));

/** Catálogo de 2500: más que el límite de 2000 que traía la pantalla antes. */
const CATALOGO = Array.from({ length: 2500 }, (_, i) => ({
  id: i + 1,
  codigo: `SKU-${String(i + 1).padStart(5, '0')}`,
  codigoBarras: `74656220${String(i + 1).padStart(5, '0')}`,
  nombre: `PRODUCTO ${i + 1}`,
  stock: 0,
  costoPromedio: 0,
}));

/** El de la queja: fuera del primer lote de 2000 y con código de barras real. */
const PAN = {
  id: 2401,
  codigo: 'MAG-029',
  codigoBarras: '7465622022077',
  nombre: 'MAGNIFIQUE PAN DE SANDWICH 29 UNIDADES',
  stock: 0,
  costoPromedio: 145.5,
};
CATALOGO[2400] = PAN;

/** Backend de mentira: busca en TODO el catálogo, como hace el de verdad. */
function backendBusca(_p: number, limit: number, search: string) {
  const t = (search ?? '').trim().toLowerCase();
  const hits = !t ? CATALOGO : CATALOGO.filter(p =>
    p.nombre.toLowerCase().includes(t) ||
    p.codigo.toLowerCase().includes(t) ||
    p.codigoBarras.toLowerCase().includes(t),
  );
  return Promise.resolve({ data: hits.slice(0, limit), meta: { total: hits.length } });
}

function montar(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SelectProductoBusqueda {...props} />
    </QueryClientProvider>,
  );
}

describe('SelectProductoBusqueda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productosApiMock.list.mockImplementation((p: number, limit: number, search: string) =>
      backendBusca(p, limit, search),
    );
  });

  it('encuentra por código de barras un producto fuera del primer lote', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), '7465622022077');

    await waitFor(() => {
      expect(screen.getByTitle('MAG-029 — MAGNIFIQUE PAN DE SANDWICH 29 UNIDADES')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Y la búsqueda se hizo contra el servidor, con el término tecleado.
    expect(productosApiMock.list).toHaveBeenCalledWith(1, 50, '7465622022077', true);
  });

  it('avisa a la pantalla del producto elegido (para pre-llenar el costo)', async () => {
    const user = userEvent.setup();
    const onProductoSeleccionado = vi.fn();
    montar({ onProductoSeleccionado });

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), '7465622022077');

    const opcion = await screen.findByTitle(
      'MAG-029 — MAGNIFIQUE PAN DE SANDWICH 29 UNIDADES', {}, { timeout: 3000 },
    );
    await user.click(opcion);

    await waitFor(() => {
      expect(onProductoSeleccionado).toHaveBeenCalledWith(expect.objectContaining({
        id: 2401, codigoBarras: '7465622022077', costoPromedio: 145.5,
      }));
    });
  });

  it('al escanear (Enter) con una sola coincidencia exacta, la selecciona sola', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    montar({ onChange });

    await user.click(screen.getByRole('combobox'));
    // La pistola teclea y cierra con Enter sin esperar al debounce.
    await user.type(screen.getByRole('combobox'), '7465622022077{Enter}');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(2401), { timeout: 3000 });
  });

  it('no busca con menos de 2 caracteres — no dispara una consulta por tecla', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), '7');

    await new Promise(r => setTimeout(r, 500));
    expect(productosApiMock.list).not.toHaveBeenCalled();
  });
});

describe('ordenarExactoPrimero', () => {
  const lista = [
    { id: 1, codigo: 'A-1', codigoBarras: '111', nombre: 'ALFA' },
    { id: 2, codigo: 'B-2', codigoBarras: '7465622022077', nombre: 'BETA' },
    { id: 3, codigo: '7465622022077', codigoBarras: '333', nombre: 'GAMMA' },
  ];

  it('pone primero las coincidencias exactas de código o código de barras', () => {
    const r = ordenarExactoPrimero(lista, '7465622022077');
    expect(r.map(p => p.id)).toEqual([2, 3, 1]);
  });

  it('deja la lista como está si no hay ninguna exacta', () => {
    expect(ordenarExactoPrimero(lista, 'alfa').map(p => p.id)).toEqual([1, 2, 3]);
  });

  it('compara sin distinguir mayúsculas ni espacios alrededor', () => {
    expect(esCoincidenciaExacta(lista[0], '  a-1 ')).toBe(true);
    expect(esCoincidenciaExacta(lista[0], 'a-12')).toBe(false);
  });
});
