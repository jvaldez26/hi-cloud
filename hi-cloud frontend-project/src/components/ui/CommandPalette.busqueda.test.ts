import { describe, it, expect } from 'vitest';
import { buscarNav, construirNavItems } from './CommandPalette';

describe('CommandPalette — búsqueda sin acentos/mayúsculas y por sinónimos', () => {
  const items = construirNavItems('admin', ['car_wash'], true);

  it('ignora acentos y mayúsculas', () => {
    expect(buscarNav('facturas', items).some(i => i.key === '/facturas')).toBe(true);
    expect(buscarNav('FACTURAS', items).some(i => i.key === '/facturas')).toBe(true);
    // "Órdenes de Compra" tiene acento en el label; buscar sin acento debe igual encontrarlo.
    expect(buscarNav('ordenes de compra', items).some(i => i.key === '/compras')).toBe(true);
  });

  it('"dashboard" encuentra Inicio (sinónimo) y el label mostrado es "Inicio", no "Dashboard"', () => {
    const resultados = buscarNav('dashboard', items);
    const inicio = resultados.find(i => i.key === '/dashboard');
    expect(inicio).toBeDefined();
    expect(inicio?.label).toBe('Inicio');
  });

  it('"inicio" también encuentra el mismo ítem', () => {
    expect(buscarNav('inicio', items).some(i => i.key === '/dashboard')).toBe(true);
  });

  it('"lavadero" encuentra Car Wash (sinónimo de categoría add-on)', () => {
    const resultados = buscarNav('lavadero', items);
    expect(resultados.some(i => i.categoryId === 'car_wash')).toBe(true);
  });

  it('sin query: muestra accesos rápidos (Inicio entre los primeros resultados)', () => {
    const resultados = buscarNav('', items);
    expect(resultados.some(i => i.key === '/dashboard')).toBe(true);
  });
});
