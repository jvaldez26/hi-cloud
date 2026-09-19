/**
 * Bloque 1 — reconciliación 606/IR-2: mapFormaPagoDgii() / resolverFormaPagoCompra().
 *
 * mapFormaPagoDgii() se reescribió: antes adivinaba por substring sobre
 * texto libre y nunca se llamaba desde ningún lado (código muerto); ahora
 * traduce el enum REAL de MetodoPago (el mismo que usa CxP al registrar un
 * pago a proveedor) con match exacto, y es el único lugar del código que
 * hace esta traducción — cxp.service.ts la usa al resolver compras.formaPago.
 *
 * 2026-09-19: se le agregó el dominio numérico (1-6, el tipo DGII-nativo de
 * Factura.formasPago) para que sea EL MISMO traductor que usa el desglose
 * del Formato 607 — ver getFormato607() en declaraciones.service.ts. Ya no
 * hay dos funciones de traducción, una por formato.
 */

import { MetodoPago } from '../common/enums/metodo-pago.enum';
import { mapFormaPagoDgii, resolverFormaPagoCompra, columna607PorCodigoDgii } from './dgii.constants';

describe('mapFormaPagoDgii()', () => {
  it('traduce cada MetodoPago real a su código DGII exacto', () => {
    expect(mapFormaPagoDgii(MetodoPago.EFECTIVO)).toBe('01');
    expect(mapFormaPagoDgii(MetodoPago.TRANSFERENCIA)).toBe('02');
    expect(mapFormaPagoDgii(MetodoPago.CHEQUE)).toBe('02');
    expect(mapFormaPagoDgii(MetodoPago.TARJETA)).toBe('03');
  });

  it("'otro' no tiene código DGII confiable — devuelve null, nunca adivina Efectivo", () => {
    // Antes de este fix, la versión vieja (substring sobre texto libre)
    // caía en el fallback '01' Efectivo para cualquier valor no reconocido
    // — exactamente el bug que esta prueba cierra.
    expect(mapFormaPagoDgii(MetodoPago.OTRO)).toBeNull();
  });

  it('valor vacío o desconocido también devuelve null, no un default silencioso', () => {
    expect(mapFormaPagoDgii(undefined)).toBeNull();
    expect(mapFormaPagoDgii(null)).toBeNull();
    expect(mapFormaPagoDgii('algo-que-no-existe')).toBeNull();
  });

  it('dominio numérico (tipo DGII-nativo de Factura.formasPago, 1-6)', () => {
    expect(mapFormaPagoDgii(1)).toBe('01'); // Efectivo
    expect(mapFormaPagoDgii(2)).toBe('02'); // Cheque/Transferencia/Depósito
    expect(mapFormaPagoDgii(3)).toBe('03'); // Tarjeta
    expect(mapFormaPagoDgii(4)).toBe('04'); // Crédito
    expect(mapFormaPagoDgii(5)).toBe('05'); // Permuta
    expect(mapFormaPagoDgii(6)).toBe('06'); // Nota de Crédito
  });

  it('tipo numérico fuera de rango: null, no adivina', () => {
    expect(mapFormaPagoDgii(0)).toBeNull();
    expect(mapFormaPagoDgii(7)).toBeNull();
  });
});

describe('columna607PorCodigoDgii()', () => {
  it('mapea cada código DGII a su columna del desglose 607', () => {
    expect(columna607PorCodigoDgii('01')).toBe('efectivo');
    expect(columna607PorCodigoDgii('02')).toBe('chequeTransferencia');
    expect(columna607PorCodigoDgii('03')).toBe('tarjeta');
    expect(columna607PorCodigoDgii('04')).toBe('credito');
    expect(columna607PorCodigoDgii('05')).toBe('permuta');
  });

  it("Nota de Crédito ('06') no tiene columna propia — cae en 'otras'", () => {
    expect(columna607PorCodigoDgii('06')).toBe('otras');
  });

  it('código desconocido o null: null, no se suma a ninguna columna', () => {
    expect(columna607PorCodigoDgii(null)).toBeNull();
    expect(columna607PorCodigoDgii('07')).toBeNull();
  });
});

describe('resolverFormaPagoCompra()', () => {
  it('un solo método usado en todos los abonos: se traduce directo', () => {
    expect(resolverFormaPagoCompra([MetodoPago.EFECTIVO, MetodoPago.EFECTIVO])).toBe('01');
  });

  it('métodos distintos entre abonos parciales: 07 Mixto — nunca "el más reciente"', () => {
    expect(resolverFormaPagoCompra([MetodoPago.EFECTIVO, MetodoPago.TRANSFERENCIA])).toBe('07');
    expect(resolverFormaPagoCompra([MetodoPago.TARJETA, MetodoPago.EFECTIVO, MetodoPago.CHEQUE])).toBe('07');
  });

  it('cheque y transferencia mapean al MISMO código DGII (02) — no cuentan como "mixto" entre sí', () => {
    expect(resolverFormaPagoCompra([MetodoPago.CHEQUE, MetodoPago.TRANSFERENCIA])).toBe('02');
  });

  it('sin pagos: null — la compra aún no tiene nada que resolver', () => {
    expect(resolverFormaPagoCompra([])).toBeNull();
  });

  it("único método 'otro': null, no pisa nada con una suposición", () => {
    expect(resolverFormaPagoCompra([MetodoPago.OTRO])).toBeNull();
  });
});
