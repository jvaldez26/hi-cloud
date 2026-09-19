/**
 * Fase 2 del catálogo fiscal dominicano — sugerirTipoGasto606()/
 * sugerirRequiereNCF(). Diccionario reconstruido a partir del diagnóstico
 * de Fase 2 (2026-09-19): la heurística de prueba de ese diagnóstico
 * cubría 9 de 14 cuentas de gasto/costo del seed; este diccionario, ya
 * corregido (plurales, orden más-específico-primero), cubre 13 de 14 —
 * "ITBIS no Recuperable" queda sin sugerencia a propósito, es la única
 * genuinamente ambigua.
 */

import { sugerirTipoGasto606, sugerirRequiereNCF } from './dgii.constants';

describe('sugerirTipoGasto606()', () => {
  it('las 14 cuentas de gasto/costo del seed: 13 con sugerencia, 1 sin ella', () => {
    const casos: Array<[string, string | null]> = [
      ['Sueldos y Salarios',            '01'],
      ['TSS Patronal',                  '01'],
      ['Bonificaciones y Comisiones',   '01'],
      ['Alquiler de Local',             '03'],
      ['Servicios Públicos',            '02'],
      ['Comunicaciones',                '02'],
      ['Materiales de Oficina',         '02'],
      ['Depreciación y Amortización',   '04'],
      ['ITBIS no Recuperable',          null], // la única sin dictamen — no adivinar
      ['Gasto de Depreciación Activos', '04'],
      ['Intereses Bancarios',           '07'],
      ['Comisiones Bancarias',          '07'],
      ['Costo de Ventas de Bienes',     '09'],
      ['Costo de Producción',           '09'],
    ];
    for (const [nombre, esperado] of casos) {
      expect(sugerirTipoGasto606(nombre)).toBe(esperado);
    }
  });

  it('"Comisiones Bancarias" es 07 (gasto financiero), NO 01 (gasto de personal) — el orden más-específico-primero importa', () => {
    // Antes de reordenar las reglas, el '01' genérico de "comision" atrapaba
    // esta cuenta antes de que "07" pudiera evaluarla — exactamente el tipo
    // de bug de substring que ya rompió mapFormaPagoDgii() en el pasado.
    expect(sugerirTipoGasto606('Comisiones Bancarias')).toBe('07');
  });

  it('es insensible a mayúsculas y acentos', () => {
    expect(sugerirTipoGasto606('COSTO DE PRODUCCIÓN')).toBe('09');
    expect(sugerirTipoGasto606('comunicaciones')).toBe('02');
  });

  it('nombre sin ningún keyword conocido devuelve null, no un código al azar', () => {
    expect(sugerirTipoGasto606('Cuenta Custom Inventada Por El Cliente')).toBeNull();
  });
});

describe('sugerirRequiereNCF()', () => {
  it('nómina y sus derivados TSS van SIN NCF (false)', () => {
    expect(sugerirRequiereNCF('Sueldos y Salarios')).toBe(false);
    expect(sugerirRequiereNCF('TSS Patronal')).toBe(false);
    expect(sugerirRequiereNCF('Bonificaciones y Comisiones')).toBe(false);
  });

  it('depreciación va SIN NCF (false)', () => {
    expect(sugerirRequiereNCF('Depreciación y Amortización')).toBe(false);
    expect(sugerirRequiereNCF('Gasto de Depreciación Activos')).toBe(false);
  });

  it('gastos operativos comprados van CON NCF (true) por defecto', () => {
    expect(sugerirRequiereNCF('Alquiler de Local')).toBe(true);
    expect(sugerirRequiereNCF('Servicios Públicos')).toBe(true);
    expect(sugerirRequiereNCF('Comunicaciones')).toBe(true);
    expect(sugerirRequiereNCF('Materiales de Oficina')).toBe(true);
  });

  it('cargos bancarios (interés, comisión) y costo de venta/producción quedan sin dictamen (null) — no están en ninguna de las dos listas del material', () => {
    expect(sugerirRequiereNCF('Intereses Bancarios')).toBeNull();
    expect(sugerirRequiereNCF('Comisiones Bancarias')).toBeNull();
    expect(sugerirRequiereNCF('Costo de Ventas de Bienes')).toBeNull();
    expect(sugerirRequiereNCF('Costo de Producción')).toBeNull();
  });

  it('"ITBIS no Recuperable" queda sin dictamen (null) — la única genuinamente ambigua del seed', () => {
    expect(sugerirRequiereNCF('ITBIS no Recuperable')).toBeNull();
  });

  it('"Bonificaciones y Comisiones" NO cae en la lista ambigua de comisiones bancarias', () => {
    // Comisiones de nómina (SIN NCF) y comisiones bancarias (ambiguo) son
    // cosas distintas aunque comparten la palabra "comisiones" — el check
    // de AMBIGUOS_NCF_KW exige la calificación "bancaria(s)" explícita.
    expect(sugerirRequiereNCF('Bonificaciones y Comisiones')).toBe(false);
  });
});
