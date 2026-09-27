import { describe, it, expect } from 'vitest';
import { construirFiltroVendedorPOS } from './vendedorFiltroPanel';

describe('construirFiltroVendedorPOS', () => {
  it('admin/contador: nunca filtra, aunque haya vendedorId en localStorage', () => {
    expect(construirFiltroVendedorPOS({ esAdmin: true, vendedorId: '42' })).toBe('');
  });

  it('vendedor sin supervisor activo: filtra por su propio vendedorId', () => {
    expect(construirFiltroVendedorPOS({ esAdmin: false, vendedorId: '42' })).toBe('&vendedorId=42');
  });

  it('vendedor CON sesión de supervisor activa: ve el listado completo, como admin', () => {
    expect(construirFiltroVendedorPOS({ esAdmin: false, supervisorSessionActive: true, vendedorId: '42' })).toBe('');
  });

  it('al expirar la sesión de supervisor (supervisorSessionActive pasa a false): vuelve a filtrar, sin recargar', () => {
    const params = { esAdmin: false, supervisorSessionActive: true, vendedorId: '42' };
    expect(construirFiltroVendedorPOS(params)).toBe('');
    // Mismo objeto de parámetros, solo cambia el flag — como ocurriría al
    // re-renderizar tras el setInterval de expiración en useSupervisor.ts.
    expect(construirFiltroVendedorPOS({ ...params, supervisorSessionActive: false })).toBe('&vendedorId=42');
  });

  it('sin vendedorId en localStorage (turno no abierto): no manda un filtro roto', () => {
    expect(construirFiltroVendedorPOS({ esAdmin: false, vendedorId: null })).toBe('');
    expect(construirFiltroVendedorPOS({ esAdmin: false })).toBe('');
  });
});
