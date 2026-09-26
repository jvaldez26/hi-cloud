import { describe, it, expect } from 'vitest';
import { rolPuedeVerRuta } from './menuConfig';

/**
 * Vendedor: los módulos con equivalente ya protegido por supervisor DENTRO
 * del POS (Productos, Movimientos de Stock, Conteo Físico, Unidades de
 * Medida, Notas de Crédito, Recibos de Cobro, Gastos, Reportes/BI/KPI) se
 * ocultan del sidebar — el único camino que le queda es el POS con modo
 * supervisor activo. Admin/Contador NO pierden nada: el cambio es
 * específico al rol vendedor.
 */

const RUTAS_OCULTAS_A_VENDEDOR = [
  '/productos', '/inventario', '/conteo-inventario', '/uom',
  '/notas-credito', '/recibos-cobro', '/gastos',
  '/reportes', '/analytics', '/kpi', '/generador-reportes',
];

describe('rolPuedeVerRuta — vendedor no ve los módulos ya protegidos por supervisor en el POS', () => {
  it.each(RUTAS_OCULTAS_A_VENDEDOR)('%s: oculto para vendedor', (path) => {
    expect(rolPuedeVerRuta(path, 'vendedor')).toBe(false);
  });

  it.each(RUTAS_OCULTAS_A_VENDEDOR)('%s: admin sigue viéndolo (el cambio es específico a vendedor)', (path) => {
    expect(rolPuedeVerRuta(path, 'admin')).toBe(true);
  });

  it.each(RUTAS_OCULTAS_A_VENDEDOR)(
    '%s: contador sigue viéndolo (el cambio es específico a vendedor)', (path) => {
      expect(rolPuedeVerRuta(path, 'contador')).toBe(true);
    },
  );

  it('/productos: viewer conserva acceso de solo lectura', () => {
    expect(rolPuedeVerRuta('/productos', 'viewer')).toBe(true);
  });

  it('/facturas: vendedor sigue viéndolo — solo se gatea la transición a anulada, no el módulo entero', () => {
    expect(rolPuedeVerRuta('/facturas', 'vendedor')).toBe(true);
  });

  it('/pos: vendedor sigue viéndolo — el POS es justamente el único camino que le queda', () => {
    expect(rolPuedeVerRuta('/pos', 'vendedor')).toBe(true);
  });
});
