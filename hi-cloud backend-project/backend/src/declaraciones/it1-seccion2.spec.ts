/**
 * IT-1 — Sección II (Ingresos), Commit 1 del rebuild 2026-09-22.
 *
 * Caso dorado: cifras reales de un ejercicio (IT-1-2020.xls adjunto por el
 * usuario) — ventas gravadas 260,304.00, exentas 485,414.00, total de
 * operaciones 745,718.00. Sirve para TODOS los commits del rebuild; este
 * archivo cubre solo lo que Commit 1 calcula (Sección II, casillas 1-15).
 *
 * calcularSeccionIIIT1() delega en operacionesVentaPeriodo(), que hace UNA
 * consulta cruda (facturas + notas_credito + notas_debito) — se mockea
 * dataSource.query devolviendo filas ya con el formato de esa consulta
 * (mismo patrón que getFormato607() ya usa) y se verifica la clasificación
 * en casillas, no la sintaxis SQL en sí (esa la garantiza reusar el patrón
 * ya probado de getFormato607()/desgloseItbisFuenteVerdad()).
 */

import { DeclaracionesService } from './declaraciones.service';

function makeService(rows: any[]) {
  const dataSource = { query: jest.fn().mockResolvedValue(rows) };
  const tenantSvc = { getEmpresaId: () => 44 };
  const svc: any = Object.create(DeclaracionesService.prototype);
  svc.dataSource = dataSource;
  svc.tenantSvc  = tenantSvc;
  return svc as DeclaracionesService;
}

// Fila cruda de operacionesVentaPeriodo() — un documento "gubernamental"
// (E45) totalmente exento, como en el caso dorado, y uno "consumo" (E32)
// gravado al 18% sin e-CF (fallback por línea vía desgloseLineas).
const FILA_EXENTA_GUBERNAMENTAL = {
  id: 1, signo: 1, tipoNcf: 'E45',
  subtotal: 485414.00, total: 485414.00,
  jsonEnviado: null,
  desgloseLineas: { gravado18: 0, gravado16: 0, exento: 485414.00, itbis18: 0, itbis16: 0 },
};
const FILA_GRAVADA_18 = {
  id: 2, signo: 1, tipoNcf: 'E32',
  subtotal: 260304.00, total: 260304.00 + 46854.72,
  jsonEnviado: null,
  desgloseLineas: { gravado18: 260304.00, gravado16: 0, exento: 0, itbis18: 46854.72, itbis16: 0 },
};

describe('DeclaracionesService.calcularSeccionIIIT1 — caso dorado', () => {
  it('casilla 1 (total operaciones) = 745,718.00', async () => {
    const svc: any = makeService([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    const s2 = await svc['calcularSeccionIIIT1'](new Date('2026-09-01'), new Date('2026-09-30'));
    expect(s2.casilla1_totalOperaciones.monto).toBeCloseTo(745718.00, 2);
  });

  it('casilla 4 (exenta local) = 485,414.00 y casilla 9 (total no gravadas) coincide', async () => {
    const svc: any = makeService([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    const s2 = await svc['calcularSeccionIIIT1'](new Date('2026-09-01'), new Date('2026-09-30'));
    expect(s2.noGravadas.casilla4_exentasLocales.monto).toBeCloseTo(485414.00, 2);
    expect(s2.noGravadas.casilla9_totalNoGravadas.monto).toBeCloseTo(485414.00, 2);
  });

  it('casilla 10 (total gravadas) = casilla 11 (18%) = 260,304.00 — nada al 16%', async () => {
    const svc: any = makeService([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    const s2 = await svc['calcularSeccionIIIT1'](new Date('2026-09-01'), new Date('2026-09-30'));
    expect(s2.gravadas.casilla10_totalGravadas.monto).toBeCloseTo(260304.00, 2);
    expect(s2.gravadas.casilla11_gravadas18.monto).toBeCloseTo(260304.00, 2);
    expect(s2.gravadas.casilla12_gravadas16.monto).toBe(0);
  });

  it('casillas sin fuente de datos real quedan en 0 con estado no_aplica, nunca calculada silenciosa', async () => {
    const svc: any = makeService([FILA_EXENTA_GUBERNAMENTAL, FILA_GRAVADA_18]);
    const s2 = await svc['calcularSeccionIIIT1'](new Date('2026-09-01'), new Date('2026-09-30'));
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

  it('una nota de crédito (E34) resta del total, una nota de débito (E33) suma', async () => {
    const filaNC = {
      id: 3, signo: -1, tipoNcf: 'E34',
      subtotal: 10000, total: 11800,
      jsonEnviado: null,
      desgloseLineas: { gravado18: 10000, gravado16: 0, exento: 0, itbis18: 1800, itbis16: 0 },
    };
    const filaND = {
      id: 4, signo: 1, tipoNcf: 'E33',
      subtotal: 2000, total: 2360,
      jsonEnviado: null,
      desgloseLineas: { gravado18: 2000, gravado16: 0, exento: 0, itbis18: 360, itbis16: 0 },
    };
    const svc: any = makeService([FILA_GRAVADA_18, filaNC, filaND]);
    const s2 = await svc['calcularSeccionIIIT1'](new Date('2026-09-01'), new Date('2026-09-30'));
    // 260,304 - 10,000 (NC) + 2,000 (ND) = 252,304
    expect(s2.gravadas.casilla11_gravadas18.monto).toBeCloseTo(252304.00, 2);
  });

  it('un comprobante de exportación (E46) se clasifica en casilla 2, no en casilla 4, con aviso', async () => {
    const filaExport = {
      id: 5, signo: 1, tipoNcf: 'E46',
      subtotal: 50000, total: 50000,
      jsonEnviado: null,
      desgloseLineas: { gravado18: 0, gravado16: 0, exento: 50000, itbis18: 0, itbis16: 0 },
    };
    const svc: any = makeService([FILA_EXENTA_GUBERNAMENTAL, filaExport]);
    const s2 = await svc['calcularSeccionIIIT1'](new Date('2026-09-01'), new Date('2026-09-30'));
    expect(s2.noGravadas.casilla2_exportacionBienes.monto).toBeCloseTo(50000, 2);
    expect(s2.noGravadas.casilla4_exentasLocales.monto).toBeCloseTo(485414.00, 2); // sin la exportación
    expect(s2.avisos.some((a: string) => a.includes('exportación (E46)'))).toBe(true);
  });
});
