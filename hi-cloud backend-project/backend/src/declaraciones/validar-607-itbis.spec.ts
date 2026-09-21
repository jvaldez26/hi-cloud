/**
 * Validador del 607 — ITBIS esperado desde la fuente de verdad (2026-09-21).
 *
 * Antes: `itbisEsperado = montoFacturado × 18%`, sin importar exentos ni la
 * tasa reducida del 16%. Caso real (empresa 44, agosto 2026): E320000006818
 * con ITBIS real 195.51 (correcto para su base gravada) salía marcado como
 * error porque 18% del monto TOTAL (mayormente exento) daba 811.71 — 2022
 * falsos positivos de ITBIS bloqueando la exportación de un mes entero.
 *
 * Ahora: el ITBIS esperado sale de desgloseItbisFuenteVerdad() —
 *   1. Los totales reales del e-CF enviado (jsonEnviado.ECF.Encabezado.
 *      Totales, con desglose por tasa) cuando existe.
 *   2. Si no hay e-CF: suma por línea con la tasa real de cada una
 *      (desgloseLineas, calculado en SQL en getFormato607()).
 * Tolerancia ±RD$1 por documento (no 5% relativo), y una validación nueva
 * que sí vale la pena: ITBIS > 18% del monto es imposible con las tasas
 * vigentes.
 */

import { DgiiValidatorService, type Fila607 } from './dgii-validator.service';
import { desgloseItbisFuenteVerdad } from './dgii.constants';

const BASE: Fila607 = {
  linea: 1, id: 1, folio: 'FAC-1', encf: 'E320000000001', estadoDgii: 'aceptado',
  rncComprador: '', montoFacturado: 0, itbis: 0,
};

describe('desgloseItbisFuenteVerdad() — fuente 1: totales reales del e-CF enviado', () => {
  it('factura toda exenta: Totales solo trae MontoExento, sin ITBIS', () => {
    const jsonEnviado = { ECF: { Encabezado: { Totales: { MontoExento: 1000, MontoTotal: 1000 } } } };
    const d = desgloseItbisFuenteVerdad(jsonEnviado, null);
    expect(d).toEqual({ gravado18: 0, gravado16: 0, exento: 1000, itbis18: 0, itbis16: 0, itbisTotal: 0 });
  });

  it('factura toda al 18%: MontoGravadoI1 + TotalITBIS1', () => {
    const jsonEnviado = { ECF: { Encabezado: { Totales: {
      MontoGravadoTotal: 1000, MontoGravadoI1: 1000, ITBIS1: 18,
      TotalITBIS: 180, TotalITBIS1: 180, MontoTotal: 1180,
    } } } };
    const d = desgloseItbisFuenteVerdad(jsonEnviado, null);
    expect(d).toEqual({ gravado18: 1000, gravado16: 0, exento: 0, itbis18: 180, itbis16: 0, itbisTotal: 180 });
  });

  it('mixta 18% + exento', () => {
    const jsonEnviado = { ECF: { Encabezado: { Totales: {
      MontoGravadoTotal: 500, MontoGravadoI1: 500, MontoExento: 300, ITBIS1: 18,
      TotalITBIS: 90, TotalITBIS1: 90, MontoTotal: 890,
    } } } };
    const d = desgloseItbisFuenteVerdad(jsonEnviado, null);
    expect(d).toEqual({ gravado18: 500, gravado16: 0, exento: 300, itbis18: 90, itbis16: 0, itbisTotal: 90 });
  });

  it('mixta 16% + 18% + exento', () => {
    const jsonEnviado = { ECF: { Encabezado: { Totales: {
      MontoGravadoTotal: 800, MontoGravadoI1: 500, MontoGravadoI2: 300, MontoExento: 200,
      ITBIS1: 18, ITBIS2: 16,
      TotalITBIS: 138, TotalITBIS1: 90, TotalITBIS2: 48, MontoTotal: 1138,
    } } } };
    const d = desgloseItbisFuenteVerdad(jsonEnviado, null);
    expect(d).toEqual({ gravado18: 500, gravado16: 300, exento: 200, itbis18: 90, itbis16: 48, itbisTotal: 138 });
  });
});

describe('desgloseItbisFuenteVerdad() — fuente 2: fallback por líneas sin e-CF', () => {
  it('sin e-CF (jsonEnviado null): usa el desglose de líneas', () => {
    const desgloseLineas = { gravado18: 500, gravado16: 0, exento: 300, itbis18: 90, itbis16: 0 };
    const d = desgloseItbisFuenteVerdad(null, desgloseLineas);
    expect(d).toEqual({ gravado18: 500, gravado16: 0, exento: 300, itbis18: 90, itbis16: 0, itbisTotal: 90 });
  });

  it('con e-CF pero sin Totales reconocibles: cae al fallback de líneas', () => {
    const jsonEnviado = { ECF: { Encabezado: {} } }; // Totales ausente
    const desgloseLineas = { gravado18: 1000, gravado16: 0, exento: 0, itbis18: 180, itbis16: 0 };
    const d = desgloseItbisFuenteVerdad(jsonEnviado, desgloseLineas);
    expect(d?.itbisTotal).toBe(180);
  });

  it('sin e-CF y sin líneas: no hay ninguna fuente — devuelve null', () => {
    expect(desgloseItbisFuenteVerdad(null, null)).toBeNull();
    expect(desgloseItbisFuenteVerdad(null, undefined)).toBeNull();
  });
});

describe('DgiiValidatorService.validar607() — ITBIS contra la fuente de verdad', () => {
  const validator = new DgiiValidatorService();

  it('factura toda exenta: ITBIS 0 vs fuente 0 — sin error', () => {
    const fila: Fila607 = { ...BASE, montoFacturado: 1000, itbis: 0, itbisFuente: 0,
      desglose607: { gravado18: 0, gravado16: 0, exento: 1000, itbis18: 0, itbis16: 0, itbisTotal: 0 } };
    const r = validator.validar607([fila]);
    expect(r.errores.filter(e => e.campo === 'ITBIS')).toHaveLength(0);
  });

  it('factura toda al 18%: ITBIS correcto — sin error', () => {
    const fila: Fila607 = { ...BASE, montoFacturado: 1000, itbis: 180, itbisFuente: 180,
      desglose607: { gravado18: 1000, gravado16: 0, exento: 0, itbis18: 180, itbis16: 0, itbisTotal: 180 } };
    const r = validator.validar607([fila]);
    expect(r.errores.filter(e => e.campo === 'ITBIS')).toHaveLength(0);
  });

  it('mixta 18%+exento — el caso real del bug: ITBIS bajo NO es error si coincide con la fuente', () => {
    // 18% del monto total (2714) daría 488.52 — el bug viejo lo habría marcado error.
    const fila: Fila607 = { ...BASE, montoFacturado: 2714, itbis: 195.51, itbisFuente: 195.51,
      desglose607: { gravado18: 1086, gravado16: 0, exento: 1628, itbis18: 195.51, itbis16: 0, itbisTotal: 195.51 } };
    const r = validator.validar607([fila]);
    expect(r.errores.filter(e => e.campo === 'ITBIS')).toHaveLength(0);
  });

  it('mixta 16%+18%+exento: ITBIS correcto — sin error', () => {
    const fila: Fila607 = { ...BASE, montoFacturado: 1000, itbis: 138, itbisFuente: 138,
      desglose607: { gravado18: 500, gravado16: 300, exento: 200, itbis18: 90, itbis16: 48, itbisTotal: 138 } };
    const r = validator.validar607([fila]);
    expect(r.errores.filter(e => e.campo === 'ITBIS')).toHaveLength(0);
  });

  it('ITBIS del 607 NO cuadra con la fuente de verdad: error real, con desglose en el mensaje', () => {
    const fila: Fila607 = { ...BASE, montoFacturado: 1000, itbis: 100, itbisFuente: 180,
      desglose607: { gravado18: 1000, gravado16: 0, exento: 0, itbis18: 180, itbis16: 0, itbisTotal: 180 } };
    const r = validator.validar607([fila]);
    const err = r.errores.find(e => e.campo === 'ITBIS');
    expect(err).toBeDefined();
    expect(err!.mensaje).toContain('no cuadra con la fuente de verdad');
    expect(err!.mensaje).toContain('gravado 18%: 1000.00');
    expect(err!.mensaje).toContain('exento: 0.00');
  });

  it('diferencia de RD$1 o menos: tolerancia de redondeo, no error', () => {
    const fila: Fila607 = { ...BASE, montoFacturado: 1000, itbis: 179.5, itbisFuente: 180,
      desglose607: { gravado18: 1000, gravado16: 0, exento: 0, itbis18: 180, itbis16: 0, itbisTotal: 180 } };
    const r = validator.validar607([fila]);
    expect(r.errores.filter(e => e.campo === 'ITBIS')).toHaveLength(0);
  });

  it('ITBIS mayor al 18% del monto: error, imposible con las tasas vigentes', () => {
    const fila: Fila607 = { ...BASE, montoFacturado: 1000, itbis: 250, itbisFuente: 250,
      desglose607: { gravado18: 1000, gravado16: 0, exento: 0, itbis18: 250, itbis16: 0, itbisTotal: 250 } };
    const r = validator.validar607([fila]);
    const err = r.errores.find(e => e.mensaje.includes('imposible con las tasas vigentes'));
    expect(err).toBeDefined();
  });

  it('sin e-CF y sin fuente (itbisFuente null): no bloquea por ITBIS por falta de dato', () => {
    const fila: Fila607 = { ...BASE, encf: '', montoFacturado: 1000, itbis: 999, itbisFuente: null, desglose607: null };
    const r = validator.validar607([fila]);
    // El 999 sí dispara el tope del 18% (180) — ese error es correcto y esperado.
    // Lo que NO debe aparecer es el error "no cuadra con la fuente de verdad".
    expect(r.errores.some(e => e.mensaje.includes('no cuadra con la fuente de verdad'))).toBe(false);
  });
});
