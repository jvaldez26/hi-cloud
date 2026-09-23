/**
 * IT-1 — Sección II (Ingresos), Commit 1 del rebuild 2026-09-22.
 *
 * Caso dorado: cifras reales de un ejercicio (IT-1-2020.xls adjunto por el
 * usuario) — ventas gravadas 260,304.00, exentas 485,414.00, total de
 * operaciones 745,718.00. Sirve para TODOS los commits del rebuild; este
 * archivo cubre solo lo que Commit 1 calcula (Sección II, casillas 1-15).
 *
 * calcularSeccionIIIT1(filas) recibe las filas YA transformadas por
 * operacionesVentaPeriodo() — {tipoNcf, gravado18, gravado16, exento,
 * itbis18, itbis16}, con el signo (factura +1 / NC -1 / ND +1) ya aplicado.
 * Se prueba la clasificación en casillas aquí; la consulta SQL en sí reusa
 * el patrón ya probado de getFormato607()/desgloseItbisFuenteVerdad(), no
 * se repite esa cobertura.
 */

import { DeclaracionesService } from './declaraciones.service';

function calcular(filas: any[]) {
  const svc: any = Object.create(DeclaracionesService.prototype);
  return svc['calcularSeccionIIIT1'](filas);
}

// Un documento "gubernamental" (E45) totalmente exento, como en el caso
// dorado, y uno "consumo" (E32) gravado al 18%.
const FILA_EXENTA_GUBERNAMENTAL = { tipoNcf: 'E45', tipoDocumento: 'FACTURA', gravado18: 0, gravado16: 0, exento: 485414.00, itbis18: 0, itbis16: 0 };
const FILA_GRAVADA_18           = { tipoNcf: 'E32', tipoDocumento: 'FACTURA', gravado18: 260304.00, gravado16: 0, exento: 0, itbis18: 46854.72, itbis16: 0 };

describe('DeclaracionesService.calcularSeccionIIIT1 — caso dorado', () => {
  it('casilla 1 (total operaciones) = 745,718.00', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2.casilla1_totalOperaciones.monto).toBeCloseTo(745718.00, 2);
  });

  it('casilla 4 (exenta local) = 485,414.00 y casilla 9 (total no gravadas) coincide', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2.noGravadas.casilla4_exentasLocales.monto).toBeCloseTo(485414.00, 2);
    expect(s2.noGravadas.casilla9_totalNoGravadas.monto).toBeCloseTo(485414.00, 2);
  });

  it('casilla 10 (total gravadas) = casilla 11 (18%) = 260,304.00 — nada al 16%', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2.gravadas.casilla10_totalGravadas.monto).toBeCloseTo(260304.00, 2);
    expect(s2.gravadas.casilla11_gravadas18.monto).toBeCloseTo(260304.00, 2);
    expect(s2.gravadas.casilla12_gravadas16.monto).toBe(0);
  });

  it('casilla 16 (ITBIS cobrado 18%, para la Sección III) = 46,854.72', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2._itbisCobradoPorTasa.itbis18).toBeCloseTo(46854.72, 2);
    expect(s2._itbisCobradoPorTasa.itbis16).toBe(0);
  });

  it('casillas sin fuente de datos real quedan en 0 con estado no_aplica, nunca calculada silenciosa', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2.noGravadas.casilla5_exentasPorDestino.estado).toBe('no_aplica');
    expect(s2.noGravadas.casilla6_noSujetasConstruccion.estado).toBe('no_aplica');
    expect(s2.noGravadas.casilla7_noSujetasComisiones.estado).toBe('no_aplica');
    expect(s2.noGravadas.casilla8_exentasParrafosIIIyIV.estado).toBe('no_aplica');
    expect(s2.gravadas.casilla13_gravadas9Ley690.estado).toBe('no_aplica');
    expect(s2.gravadas.casilla14_gravadas8Ley690.estado).toBe('no_aplica');
    expect(s2.gravadas.casilla15_activosDepreciables.estado).toBe('no_aplica');
    // Cada 'no_aplica' trae su explicación — no es solo un flag mudo.
    expect(s2.avisos.some((a: string) => a.includes('Casilla 5'))).toBe(true);
    expect(s2.avisos.some((a: string) => a.includes('690-16'))).toBe(true);
  });

  it('una nota de crédito (E34) resta del total, una nota de débito (E33) suma', () => {
    const filaNC = { tipoNcf: 'E34', gravado18: -10000, gravado16: 0, exento: 0, itbis18: -1800, itbis16: 0 };
    const filaND = { tipoNcf: 'E33', gravado18: 2000, gravado16: 0, exento: 0, itbis18: 360, itbis16: 0 };
    const s2 = calcular([FILA_GRAVADA_18, filaNC, filaND]);
    // 260,304 - 10,000 (NC) + 2,000 (ND) = 252,304
    expect(s2.gravadas.casilla11_gravadas18.monto).toBeCloseTo(252304.00, 2);
  });

  it('un comprobante de exportación (E46) se clasifica en casilla 2, no en casilla 4, con aviso', () => {
    const filaExport = { tipoNcf: 'E46', tipoDocumento: 'FACTURA', gravado18: 0, gravado16: 0, exento: 50000, itbis18: 0, itbis16: 0 };
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, filaExport]);
    expect(s2.noGravadas.casilla2_exportacionBienes.monto).toBeCloseTo(50000, 2);
    expect(s2.noGravadas.casilla4_exentasLocales.monto).toBeCloseTo(485414.00, 2); // sin la exportación
    expect(s2.avisos.some((a: string) => a.includes('exportación (E46)'))).toBe(true);
  });
});

describe('DeclaracionesService.calcularSeccionIIIT1 — conteo de documentos (visor de origen)', () => {
  it('casilla 1 cuenta el total de documentos del período, sin importar tipo', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2.casilla1_totalOperaciones.conteo).toEqual({ facturas: 2, notasCredito: 0, notasDebito: 0 });
  });

  it('casilla 4 (exenta local) y casilla 11 (gravada 18%) cuentan solo los documentos que aportaron a cada una', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2.noGravadas.casilla4_exentasLocales.conteo).toEqual({ facturas: 1, notasCredito: 0, notasDebito: 0 });
    expect(s2.gravadas.casilla11_gravadas18.conteo).toEqual({ facturas: 1, notasCredito: 0, notasDebito: 0 });
  });

  it('una nota de crédito y una de débito se cuentan por su propio tipo, no como facturas', () => {
    const filaNC = { tipoNcf: 'E34', tipoDocumento: 'NOTA_CREDITO', gravado18: -10000, gravado16: 0, exento: 0, itbis18: -1800, itbis16: 0 };
    const filaND = { tipoNcf: 'E33', tipoDocumento: 'NOTA_DEBITO', gravado18: 2000, gravado16: 0, exento: 0, itbis18: 360, itbis16: 0 };
    const s2 = calcular([FILA_GRAVADA_18, filaNC, filaND]);
    expect(s2.gravadas.casilla11_gravadas18.conteo).toEqual({ facturas: 1, notasCredito: 1, notasDebito: 1 });
  });

  it('casillas no_aplica no traen conteo — no hay documentos reales que contar', () => {
    const s2 = calcular([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    expect(s2.noGravadas.casilla5_exentasPorDestino.conteo).toBeUndefined();
  });
});
