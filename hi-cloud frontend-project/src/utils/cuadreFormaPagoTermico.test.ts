import { describe, it, expect } from 'vitest';
import { bloqueCuadreFormaPagoTermico } from './cuadreFormaPagoTermico';

/**
 * Bug real (2026-10-10): el cuadre por forma de pago se agregó al Drawer en
 * pantalla pero nunca a las plantillas de impresión (CajaPage.tsx, POSPage.tsx)
 * — reimprimir cualquier cierre, viejo o recién cerrado, seguía mostrando el
 * formato de solo-efectivo. Estos tests fijan que el bloque sale cuando el
 * cierre lo trae, y qué pasa en los casos borde que ya rompieron en producción.
 */
describe('bloqueCuadreFormaPagoTermico', () => {
  const cierreReal = {
    cuadrePorFormaPago: [
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ],
    sospechasFormaPago: [
      { formaSobrante: 'efectivo', formaFaltante: 'tarjeta', monto: 829.94 },
    ],
    facturasSinFormaPago: [
      { id: 1807, folio: 'FAC-1807', total: 295.00, clienteNombre: 'Bellamar González' },
    ],
  };

  it('caso real (empresa 73): imprime la tabla, la sospecha y la factura sin forma de pago', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(html).toContain('CUADRE POR FORMA DE PAGO');
    expect(html).toContain('5,608.06');
    expect(html).toContain('6,438.00');
    expect(html).toContain('829.94');
    expect(html).toContain('2,605.00');
    expect(html).toContain('1,775.00');
    expect(html).toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).toContain('FACTURAS SIN FORMA DE PAGO');
    expect(html).toContain('FAC-1807');
    expect(html).toContain('Bellamar González');
  });

  it('sin cuadrePorFormaPago (ej. caja ABIERTA): no imprime nada — el llamador cae a su bloque viejo', () => {
    expect(bloqueCuadreFormaPagoTermico(undefined)).toBe('');
    expect(bloqueCuadreFormaPagoTermico({})).toBe('');
    expect(bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: [] })).toBe('');
  });

  it('cierre derivado (legacy, cuadreEstimado): lo marca "(estimado)" en el título', () => {
    const html = bloqueCuadreFormaPagoTermico({ ...cierreReal, cuadreEstimado: true });
    expect(html).toContain('CUADRE POR FORMA DE PAGO (estimado)');
  });

  it('sin sospechas ni facturas sin forma de pago: solo la tabla, sin avisos', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
    });
    expect(html).toContain('CUADRE POR FORMA DE PAGO');
    expect(html).not.toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('FACTURAS SIN FORMA DE PAGO');
  });

  it('con un ajuste posterior (cuadreCorregido): muestra el original Y el corregido', () => {
    const html = bloqueCuadreFormaPagoTermico({
      ...cierreReal,
      cuadreCorregido: [
        { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
        { forma: 'tarjeta',  esperado: 1775.00, declarado: 1775.00, diferencia: 0 },
      ],
    });
    expect(html).toContain('CUADRE CORREGIDO');
    expect(html).toContain('6,438.06');
    // el original sigue presente también
    expect(html).toContain('5,608.06');
  });
});
