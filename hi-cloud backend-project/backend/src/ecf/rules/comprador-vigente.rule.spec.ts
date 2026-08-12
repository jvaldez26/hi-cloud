/**
 * RNC no vigente — el comprador suspendido o dado de baja se ADVIERTE, no se
 * impide: se pide una confirmación explícita y, si se da, se emite y queda
 * registrado. Aquí vive esa regla y el contrato del error que la comunica.
 */

import {
  evaluarCompradorFiscal, esCreditoFiscal, estadoNoVigente, normalizarEstado,
  payloadCompradorNoVigente, TIPOS_CREDITO_FISCAL,
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

describe('E31 / E44 / E45 — el comprador no vigente se advierte, no se impide', () => {
  it.each([31, 44, 45])('E%s con RNC SUSPENDIDO pide confirmación', (tipo) => {
    const r = evaluarCompradorFiscal(tipo, { encontrado: true, estado: 'SUSPENDIDO' });
    expect(r.bloquear).toBe(true);
    expect(r.requiereConfirmacion).toBe(true);
    expect(r.confirmado).toBe(false);
    expect(r.motivo).toContain('SUSPENDIDO');
    expect(r.motivo).toContain('E32');   // le dice al cajero qué alternativa tiene
  });

  it('E31 con RNC DADO DE BAJA pide confirmación', () => {
    expect(evaluarCompradorFiscal(31, { encontrado: true, estado: 'DADO DE BAJA' }).bloquear).toBe(true);
  });

  it.each([31, 44, 45])('E%s se emite cuando el usuario confirma', (tipo) => {
    const r = evaluarCompradorFiscal(tipo, { encontrado: true, estado: 'SUSPENDIDO' }, true);
    expect(r.bloquear).toBe(false);
    expect(r.confirmado).toBe(true);
    // El motivo se conserva para que quede registrado que se emitió advertido
    expect(r.motivo).toContain('SUSPENDIDO');
    expect(r.estado).toBe('SUSPENDIDO');
  });

  it('confirmar no inventa advertencias donde no las hay', () => {
    const r = evaluarCompradorFiscal(31, { encontrado: true, estado: 'ACTIVO' }, true);
    expect(r.bloquear).toBe(false);
    expect(r.requiereConfirmacion).toBeUndefined();
    expect(r.confirmado).toBeUndefined();
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

/**
 * El cuerpo del error es un CONTRATO con el frontend: cada pantalla de emisión
 * lo lee para saber que debe ofrecer la casilla de confirmación en vez de un
 * toast. Se rompió una vez —el listado de facturas mostraba el mensaje sin
 * dónde confirmar y la emisión quedaba trabada—, así que se fija aquí.
 */
describe('contrato del error hacia el frontend', () => {
  const payload = () => payloadCompradorNoVigente(
    evaluarCompradorFiscal(31, { encontrado: true, estado: 'SUSPENDIDO' }),
    '132269551',
  );

  it('lleva el código que las pantallas usan para reconocerlo', () => {
    expect(payload().codigo).toBe('COMPRADOR_NO_VIGENTE');
  });

  it('se anuncia como confirmable — nunca como un rechazo definitivo', () => {
    expect(payload().confirmable).toBe(true);
  });

  it('incluye estado y RNC para poder redactar el aviso', () => {
    expect(payload().estadoRnc).toBe('SUSPENDIDO');
    expect(payload().rnc).toBe('132269551');
  });

  it('el mensaje explica la situación y la alternativa', () => {
    expect(payload().message).toContain('SUSPENDIDO');
    expect(payload().message).toContain('E32');
  });

  it('nunca queda sin mensaje, aunque el veredicto venga vacío', () => {
    const p = payloadCompradorNoVigente({ bloquear: true }, '000000000');
    expect(p.message.length).toBeGreaterThan(0);
    expect(p.codigo).toBe('COMPRADOR_NO_VIGENTE');
  });
});

describe('falla ABIERTA — el padrón no puede parar la facturación', () => {
  it('sin respuesta del padrón se permite', () => {
    expect(evaluarCompradorFiscal(31, undefined).bloquear).toBe(false);
    expect(evaluarCompradorFiscal(31, null).bloquear).toBe(false);
  });

  it('RNC no encontrado se permite SIN advertir', () => {
    // Caso real: los RNC gubernamentales de la serie 401xxxxxx (entidades
    // públicas, distritos educativos) no figuran como contribuyentes y el
    // padrón responde 404. Eso no dice nada sobre la validez de la venta, así
    // que no se advierte ni se pide confirmar — solo se emite.
    const r = evaluarCompradorFiscal(45, { encontrado: false });
    expect(r.bloquear).toBe(false);
    expect(r.requiereConfirmacion).toBeUndefined();
    expect(r.motivo).toBeUndefined();
  });

  it('estado desconocido o vacío se permite', () => {
    expect(evaluarCompradorFiscal(31, { encontrado: true, estado: '' }).bloquear).toBe(false);
    expect(evaluarCompradorFiscal(31, { encontrado: true, estado: 'EN TRAMITE' }).bloquear).toBe(false);
    expect(evaluarCompradorFiscal(31, { encontrado: true }).bloquear).toBe(false);
  });

  it('solo pide confirmación cuando el padrón lo afirma explícitamente', () => {
    // Resumen de la política: de todos estos casos, solo uno frena algo, y lo
    // frena hasta que el usuario confirme — nunca de forma definitiva.
    const casos = [
      undefined,
      null,
      { encontrado: false },                        // no inscrito (401xxxxxx)
      { encontrado: true, estado: 'ACTIVO' },
      { encontrado: true, estado: '' },
      { encontrado: true, estado: 'SUSPENDIDO' },   // ← el único
    ];
    const frenados = casos.filter(c => evaluarCompradorFiscal(31, c as any).bloquear);
    expect(frenados).toHaveLength(1);

    // Y ese único deja de frenar en cuanto se confirma: ninguno es un muro.
    const conConfirmacion = casos.filter(c => evaluarCompradorFiscal(31, c as any, true).bloquear);
    expect(conConfirmacion).toHaveLength(0);
  });
});
