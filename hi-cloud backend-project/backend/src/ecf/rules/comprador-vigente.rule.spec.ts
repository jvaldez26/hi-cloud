/**
 * RNC suspendido — un comprador no vigente no puede recibir crédito fiscal.
 *
 * El POS ya mostraba la etiqueta "(SUSPENDIDO)" al digitar el RNC, pero dejaba
 * cobrar y emitir el E31 igual. Aquí vive la regla de verdad.
 */

import {
  evaluarCompradorFiscal, esCreditoFiscal, estadoNoVigente, normalizarEstado,
  TIPOS_CREDITO_FISCAL,
} from './comprador-vigente.rule';

describe('qué tipos otorgan crédito fiscal', () => {
  it('31, 44 y 45 sí', () => {
    for (const t of TIPOS_CREDITO_FISCAL) expect(esCreditoFiscal(t)).toBe(true);
  });

  it('consumo y los demás no', () => {
    for (const t of [32, 33, 34, 41, 43, 46, 47]) expect(esCreditoFiscal(t)).toBe(false);
  });
});

describe('lectura del estado del padrón', () => {
  it.each([
    ['SUSPENDIDO',    true],
    ['suspendido',    true],
    ['Suspendido',    true],
    ['DADO DE BAJA',  true],
    ['dado de baja',  true],
    ['BAJA',          true],
    ['ACTIVO',        false],
    ['activo',        false],
    ['',              false],
    [null,            false],
    [undefined,       false],
  ])('%s → no vigente: %s', (estado, esperado) => {
    expect(estadoNoVigente(estado as any)).toBe(esperado);
  });

  it('tolera acentos y espacios sobrantes', () => {
    expect(normalizarEstado('  actívo ')).toBe('ACTIVO');
    expect(estadoNoVigente(' Suspendído ')).toBe(true);
  });
});

describe('E31 / E44 / E45 — se bloquea al comprador no vigente', () => {
  it.each([31, 44, 45])('E%s con RNC SUSPENDIDO se bloquea', (tipo) => {
    const r = evaluarCompradorFiscal(tipo, { encontrado: true, estado: 'SUSPENDIDO' });
    expect(r.bloquear).toBe(true);
    expect(r.motivo).toContain('SUSPENDIDO');
    expect(r.motivo).toContain('E32');   // le dice al cajero qué hacer
  });

  it('E31 con RNC DADO DE BAJA se bloquea', () => {
    expect(evaluarCompradorFiscal(31, { encontrado: true, estado: 'DADO DE BAJA' }).bloquear).toBe(true);
  });

  it('E31 con RNC ACTIVO se permite', () => {
    expect(evaluarCompradorFiscal(31, { encontrado: true, estado: 'ACTIVO' }).bloquear).toBe(false);
  });
});

describe('los tipos sin crédito fiscal no se ven afectados', () => {
  it.each([32, 33, 34, 41, 43, 46, 47])('E%s con RNC suspendido se permite', (tipo) => {
    expect(evaluarCompradorFiscal(tipo, { encontrado: true, estado: 'SUSPENDIDO' }).bloquear).toBe(false);
  });
});

describe('falla ABIERTA — el padrón no puede parar la facturación', () => {
  it('sin respuesta del padrón se permite', () => {
    expect(evaluarCompradorFiscal(31, undefined).bloquear).toBe(false);
    expect(evaluarCompradorFiscal(31, null).bloquear).toBe(false);
  });

  it('RNC no encontrado se permite', () => {
    expect(evaluarCompradorFiscal(31, { encontrado: false }).bloquear).toBe(false);
  });

  it('estado desconocido o vacío se permite', () => {
    expect(evaluarCompradorFiscal(31, { encontrado: true, estado: '' }).bloquear).toBe(false);
    expect(evaluarCompradorFiscal(31, { encontrado: true, estado: 'EN TRAMITE' }).bloquear).toBe(false);
    expect(evaluarCompradorFiscal(31, { encontrado: true }).bloquear).toBe(false);
  });

  it('solo bloquea cuando el padrón lo afirma explícitamente', () => {
    // Resumen de la política: de todos estos casos, solo uno bloquea.
    const casos = [
      undefined,
      null,
      { encontrado: false },
      { encontrado: true, estado: 'ACTIVO' },
      { encontrado: true, estado: '' },
      { encontrado: true, estado: 'SUSPENDIDO' },   // ← el único
    ];
    const bloqueados = casos.filter(c => evaluarCompradorFiscal(31, c as any).bloquear);
    expect(bloqueados).toHaveLength(1);
  });
});
