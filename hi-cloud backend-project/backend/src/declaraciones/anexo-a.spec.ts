/**
 * Anexo A del IT-1 — Commit 4 del rebuild 2026-09-22.
 *
 * Reusa DeclaracionesService.operacionesVentaPeriodo()/calcularSeccionIIIT1()
 * — no repite la clasificación gravada/exenta/exportación, ya probada en
 * it1-seccion2.spec.ts. Este archivo prueba la agrupación PROPIA de Anexo A:
 * por tipo de NCF (Sección II), forma de pago (Sección III), tipo de
 * ingreso (Sección IV) e ITBIS pagado con proporcionalidad (Sección IX).
 *
 * Nota sobre el caso dorado y la Sección IX: el Excel real (IT-1-2020.xls)
 * tiene ventas mixtas (exenta 485,414 + gravada 260,304) pero el preparador
 * puso el ITBIS pagado ENTERO en la casilla 50 (100% deducible, casilla 53
 * de proporcionalidad en 0) — una atribución que solo un contador con
 * conocimiento directo de a qué venta corresponde cada compra puede hacer.
 * El sistema no tiene esa señal, así que por diseño trata TODO el ITBIS
 * pagado como "común" (sujeto a proporcionalidad) en cuanto hay exención
 * local — más conservador que ese filing real, nunca menos. Por eso los
 * tests de Sección IX usan escenarios propios, no el número final de
 * casilla 56 del Excel.
 */

import { AnexoAService } from './anexo-a.service';
import { ParametroFiscalPendienteError } from '../parametros-fiscales/errors/parametro-fiscal.errors';

function makeService(opts: {
  compras?: number; gastos?: number; proporcionalidad?: any;
} = {}) {
  const dataSource = {
    query: jest.fn()
      .mockResolvedValueOnce([{ itbis: String(opts.compras ?? 0) }])
      .mockResolvedValueOnce([{ itbis: String(opts.gastos ?? 0) }]),
  };
  const tenantSvc = { getEmpresaId: () => 44 };
  const proporcionalidadSvc = {
    calcular: opts.proporcionalidad instanceof Error
      ? jest.fn().mockRejectedValue(opts.proporcionalidad)
      : jest.fn().mockResolvedValue(opts.proporcionalidad),
  };
  const svc: any = Object.create(AnexoAService.prototype);
  svc.dataSource = dataSource;
  svc.tenantSvc  = tenantSvc;
  svc.proporcionalidadSvc = proporcionalidadSvc;
  return { svc: svc as AnexoAService, dataSource, proporcionalidadSvc };
}

// Filas ya en el formato de operacionesVentaPeriodo() — mismo caso dorado
// que it1-seccion2.spec.ts, más una nota de crédito/débito y un tipo
// desconocido para probar el catch-all dinámico.
const FILA_GUBERNAMENTAL = {
  tipoNcf: 'E45', tipoDocumento: 'FACTURA', gravado18: 0, gravado16: 0, exento: 485414.00,
  itbis18: 0, itbis16: 0, total: 485414.00, formasPago: [{ tipo: 2, monto: 485414.00 }],
};
const FILA_CONSUMO_18 = {
  tipoNcf: 'E32', tipoDocumento: 'FACTURA', gravado18: 260304.00, gravado16: 0, exento: 0,
  itbis18: 46854.72, itbis16: 0, total: 260304.00 + 46854.72, formasPago: [{ tipo: 1, monto: 260304.00 + 46854.72 }],
};

describe('AnexoAService — Sección II (por tipo de NCF), agrupación dinámica', () => {
  it('E45 cae en casilla 7 (gubernamentales), E32 en casilla 2 (consumo)', () => {
    const { svc } = makeService();
    const s2: any = (svc as any)['seccionII']([FILA_GUBERNAMENTAL, FILA_CONSUMO_18]);
    expect(s2.casilla7_gubernamentales.monto).toBeCloseTo(485414.00, 2);
    expect(s2.casilla7_gubernamentales.cantidad).toBe(1);
    expect(s2.casilla2_consumo.monto).toBeCloseTo(260304.00, 2);
  });

  it('casilla 11 (total operaciones) = 745,718.00, igual que la casilla 1 del IT-1', () => {
    const { svc } = makeService();
    const s2: any = (svc as any)['seccionII']([FILA_GUBERNAMENTAL, FILA_CONSUMO_18]);
    expect(s2.casilla11_totalOperaciones.monto).toBeCloseTo(745718.00, 2);
  });

  it('una nota de crédito (E34) resta en casilla 4, una de débito (E33) suma en casilla 3', () => {
    const { svc } = makeService();
    const filaNC = { tipoNcf: 'E34', tipoDocumento: 'NOTA_CREDITO', gravado18: -5000, gravado16: 0, exento: 0, itbis18: -900, itbis16: 0, total: 5900, formasPago: [] };
    const filaND = { tipoNcf: 'E33', tipoDocumento: 'NOTA_DEBITO', gravado18: 1000, gravado16: 0, exento: 0, itbis18: 180, itbis16: 0, total: 1180, formasPago: [] };
    const s2: any = (svc as any)['seccionII']([FILA_CONSUMO_18, filaNC, filaND]);
    expect(s2.casilla3_notaDebito.monto).toBeCloseTo(1000, 2);
    expect(s2.casilla4_notaCredito.monto).toBeCloseTo(5000, 2); // casilla 4 reporta el valor absoluto de lo restado
  });

  it('un tipoNcf desconocido/futuro cae en la casilla 9 (catch-all) — nunca desaparece', () => {
    const { svc } = makeService();
    const filaDesconocida = { tipoNcf: 'E99', tipoDocumento: 'FACTURA', gravado18: 3000, gravado16: 0, exento: 0, itbis18: 540, itbis16: 0, total: 3540, formasPago: [] };
    const s2: any = (svc as any)['seccionII']([filaDesconocida]);
    expect(s2.casilla9_otrasPositivas.monto).toBeCloseTo(3000, 2);
    expect(s2.casilla11_totalOperaciones.monto).toBeCloseTo(3000, 2);
  });
});

describe('AnexoAService — Sección III (por forma de pago), monto bruto', () => {
  it('efectivo (tipo 1) y transferencia (tipo 2) se separan correctamente, con ITBIS incluido', () => {
    const { svc } = makeService();
    const s3: any = (svc as any)['seccionIII']([FILA_GUBERNAMENTAL, FILA_CONSUMO_18]);
    expect(s3.seccion.casilla13_chequeTransferencia.monto).toBeCloseTo(485414.00, 2); // tipo 2
    expect(s3.seccion.casilla12_efectivo.monto).toBeCloseTo(260304.00 + 46854.72, 2); // tipo 1
  });

  it('una nota de crédito queda exenta del desglose (regla DGII, mismo criterio del 607)', () => {
    const { svc } = makeService();
    const filaNC = { tipoNcf: 'E34', tipoDocumento: 'NOTA_CREDITO', gravado18: -1000, gravado16: 0, exento: 0, itbis18: -180, itbis16: 0, total: 1180, formasPago: [] };
    const s3: any = (svc as any)['seccionIII']([filaNC]);
    expect(s3.seccion.casilla19_total.monto).toBe(0);
  });

  it('una nota de débito se asume 100% "A Crédito" (casilla 15) — no captura forma de pago propia', () => {
    const { svc } = makeService();
    const filaND = { tipoNcf: 'E33', tipoDocumento: 'NOTA_DEBITO', gravado18: 1000, gravado16: 0, exento: 0, itbis18: 180, itbis16: 0, total: 1180, formasPago: [] };
    const s3: any = (svc as any)['seccionIII']([filaND]);
    expect(s3.seccion.casilla15_aCredito.monto).toBeCloseTo(1180, 2);
  });

  it('casilla 16 (bonos) siempre no_aplica — el sistema no distingue esa forma de pago', () => {
    const { svc } = makeService();
    const s3: any = (svc as any)['seccionIII']([FILA_CONSUMO_18]);
    expect(s3.seccion.casilla16_bonos.estado).toBe('no_aplica');
  });
});

describe('AnexoAService — Sección IV (por tipo de ingreso)', () => {
  it('casilla 20 = total de operaciones, el resto no_aplica', () => {
    const { svc } = makeService();
    const s4: any = (svc as any)['seccionIV'](745718.00);
    expect(s4.seccion.casilla20_ingresosOperaciones.monto).toBeCloseTo(745718.00, 2);
    expect(s4.seccion.casilla26_total.monto).toBeCloseTo(745718.00, 2);
    expect(s4.seccion.casilla21_ingresosFinancieros.estado).toBe('no_aplica');
  });
});

describe('AnexoAService — Sección IX (ITBIS Pagado), sin exención local', () => {
  it('sin venta exenta local: 100% deducible en casilla 50, sin llamar al motor de proporcionalidad', async () => {
    const { svc, proporcionalidadSvc } = makeService({ compras: 9680.29, gastos: 0 });
    const s9: any = await (svc as any)['seccionIX'](9680.29, 0, 0, 260304, 260304, new Date('2026-09-30'));
    expect(proporcionalidadSvc.calcular).not.toHaveBeenCalled();
    expect(s9.deducibleNoSujetoAProporcionalidad.casilla50_bienesGravados.monto).toBeCloseTo(9680.29, 2);
    expect(s9.casilla56_totalItbisDeducible.monto).toBeCloseTo(9680.29, 2);
  });
});

describe('AnexoAService — Sección IX, con exención local (ventas mixtas)', () => {
  it('con exención local: todo el ITBIS pagado se trata como común, se le aplica el coeficiente del motor', async () => {
    const { svc, proporcionalidadSvc } = makeService({
      compras: 9680.29, gastos: 0,
      proporcionalidad: { periodo: 'mensualConAjusteAnual', ventasTotales: 745718, factor: 0.3491, itbisComun: 9680.29, itbisDeducible: 3379.63, itbisNoDeducible: 6300.66 },
    });
    const s9: any = await (svc as any)['seccionIX'](9680.29, 0, 485414, 260304, 745718, new Date('2026-09-30'));
    expect(proporcionalidadSvc.calcular).toHaveBeenCalledWith(expect.objectContaining({
      ventasGravadas: 260304, ventasExportaciones: 0, ventasExentas: 485414, itbisComun: 9680.29,
    }));
    expect(s9.sujetoAProporcionalidad.casilla53_itbisSujeto.monto).toBeCloseTo(9680.29, 2);
    expect(s9.sujetoAProporcionalidad.casilla54_coeficiente.monto).toBeCloseTo(34.91, 2);
    expect(s9.casilla56_totalItbisDeducible.monto).toBeCloseTo(3379.63, 2);
  });

  it('parámetro de proporcionalidad pendiente de validación: requiere_revision, nunca un 0 silencioso', async () => {
    const { svc } = makeService({
      compras: 9680.29, gastos: 0,
      proporcionalidad: new ParametroFiscalPendienteError('proporcionalidad_itbis_periodo', '2026-09-30'),
    });
    const s9: any = await (svc as any)['seccionIX'](9680.29, 0, 485414, 260304, 745718, new Date('2026-09-30'));
    expect(s9.sujetoAProporcionalidad.casilla54_coeficiente.estado).toBe('requiere_revision');
    expect(s9.casilla56_totalItbisDeducible.estado).toBe('requiere_revision');
    expect(s9.avisos.some((a: string) => a.includes('requiere revisión'))).toBe(true);
  });
});
