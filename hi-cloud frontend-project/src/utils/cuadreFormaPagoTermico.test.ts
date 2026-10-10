import { describe, it, expect } from 'vitest';
import { bloqueCuadreFormaPagoTermico } from './cuadreFormaPagoTermico';

/**
 * Bug real (2026-10-10): el cuadre por forma de pago se agregó al Drawer en
 * pantalla pero nunca a las plantillas de impresión (CajaPage.tsx, POSPage.tsx)
 * — reimprimir cualquier cierre, viejo o recién cerrado, seguía mostrando el
 * formato de solo-efectivo. Estos tests fijan que el bloque sale cuando el
 * cierre lo trae, y qué pasa en los casos borde que ya rompieron en producción.
 *
 * Segunda vuelta (mismo día, reimpresión del caso real): el neto salía
 * -295.06 en vez de -0.06 (FAC-1807 entraba al cuadre en vez de quedar
 * aparte — eso se corrige en caja.service.ts, aquí solo se verifica que el
 * bloque imprime el neto QUE LE DAN, sea cual sea), el aviso mostraba
 * +829.94 / -829.94 en vez de los montos reales (+829.94 / -830.00), faltaba
 * la lista de facturas candidatas, y había un ⚠ que rompe en ESC/POS.
 */
describe('bloqueCuadreFormaPagoTermico', () => {
  const cierreReal = {
    cuadrePorFormaPago: [
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ],
    sospechasFormaPago: [
      {
        formaSobrante: 'efectivo', formaFaltante: 'tarjeta',
        montoSobrante: 829.94, montoFaltante: -830.00,
        facturasCandidatas: [{ id: 1803, folio: 'FAC-1803', total: 1080, formasPago: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }] }],
      },
    ],
    facturasSinFormaPago: [
      { id: 1807, folio: 'FAC-1807', total: 295.00, clienteNombre: 'Bellamar González' },
    ],
  };

  it('caso real (empresa 73): imprime la tabla, la sospecha con los montos REALES, la candidata y la factura sin forma de pago', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(html).toContain('CUADRE POR FORMA DE PAGO');
    expect(html).toContain('5,608.06');
    expect(html).toContain('6,438.00');
    expect(html).toContain('2,605.00');
    expect(html).toContain('1,775.00');
    expect(html).toContain('+829.94');
    expect(html).toContain('-830.00');
    expect(html).toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).toContain('FAC-1803'); // candidata que explica la sospecha
    expect(html).toContain('Tarjeta 955.00'); // su desglose real — lo que explica la sospecha
    expect(html).toContain('Efectivo 125.00');
    expect(html).toContain('FACTURAS SIN FORMA DE PAGO');
    expect(html).toContain('FAC-1807');
    expect(html).toContain('Bellamar González');
    // neto del caso real: 829.94 - 830.00 = -0.06
    expect(html).toContain('-0.06');
  });

  it('nunca imprime caracteres especiales (⚠) — texto plano para ESC/POS', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(html).toContain('!! POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('⚠');
  });

  it('cada fila tiene exactamente 2 <span> — el conversor ESC/POS Bluetooth solo lee los dos primeros de una fila ".row" y descarta el resto', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    const filas = html.match(/<div class="cf-row[^"]*">.*?<\/div>/gs) ?? [];
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect((f.match(/<span/g) ?? []).length).toBe(2);
    }
  });

  it('el aviso muestra los montos REALES de cada forma, no asume que sobrante y faltante son simétricos', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [
        { forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 },
      ],
      sospechasFormaPago: [{
        formaSobrante: 'efectivo', formaFaltante: 'tarjeta',
        montoSobrante: 829.94, montoFaltante: -830.00, // nunca -829.94
      }],
    });
    expect(html).toContain('+829.94');
    expect(html).toContain('-830.00');
    expect(html).not.toContain('-829.94');
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

  it('sospecha sin facturas candidatas: no revienta, no imprime la sección de candidatas', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 150, diferencia: 50 }],
      sospechasFormaPago: [{ formaSobrante: 'efectivo', formaFaltante: 'tarjeta', montoSobrante: 50, montoFaltante: -50 }],
    });
    expect(html).toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('podrían explicarlo');
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
