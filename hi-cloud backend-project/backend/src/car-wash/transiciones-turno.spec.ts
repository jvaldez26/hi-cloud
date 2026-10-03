import { transicionValida, transicionesPermitidas } from './transiciones-turno';

describe('transiciones-turno', () => {
  it('EN_ESPERA solo puede ir a EN_LAVADO o CANCELADO', () => {
    expect(transicionesPermitidas('en_espera', false).sort()).toEqual(['cancelado', 'en_lavado']);
  });

  it('EN_LAVADO va a SECADO cuando usaSecado=true', () => {
    expect(transicionesPermitidas('en_lavado', true).sort()).toEqual(['cancelado', 'secado']);
  });

  it('EN_LAVADO salta directo a LISTO cuando usaSecado=false', () => {
    expect(transicionesPermitidas('en_lavado', false).sort()).toEqual(['cancelado', 'listo']);
  });

  it('SECADO solo puede ir a LISTO (o cancelarse)', () => {
    expect(transicionesPermitidas('secado', true).sort()).toEqual(['cancelado', 'listo']);
  });

  it('LISTO solo puede ir a ENTREGADO (o cancelarse)', () => {
    expect(transicionesPermitidas('listo', false).sort()).toEqual(['cancelado', 'entregado']);
  });

  it('ENTREGADO y CANCELADO son terminales — sin transiciones, ni siquiera a cancelado', () => {
    expect(transicionesPermitidas('entregado', false)).toEqual([]);
    expect(transicionesPermitidas('cancelado', false)).toEqual([]);
  });

  it('transicionValida rechaza saltos (EN_ESPERA -> LISTO directo)', () => {
    expect(transicionValida('en_espera', 'listo', false)).toBe(false);
    expect(transicionValida('en_espera', 'en_lavado', false)).toBe(true);
  });

  it('transicionValida rechaza retroceder (EN_LAVADO -> EN_ESPERA)', () => {
    expect(transicionValida('en_lavado', 'en_espera', false)).toBe(false);
  });

  it('no se puede cancelar un turno ya ENTREGADO', () => {
    expect(transicionValida('entregado', 'cancelado', false)).toBe(false);
  });

  it('sí se puede cancelar desde cualquier estado anterior a ENTREGADO', () => {
    expect(transicionValida('en_espera', 'cancelado', true)).toBe(true);
    expect(transicionValida('en_lavado', 'cancelado', true)).toBe(true);
    expect(transicionValida('secado', 'cancelado', true)).toBe(true);
    expect(transicionValida('listo', 'cancelado', true)).toBe(true);
  });
});
