import { fechaHoraRD, fechaTextoRD, horaTextoRD, fechaYHoraRD } from './fecha-local.util';

/**
 * El bug real: un cierre de caja anulado a las 9:14 de la mañana quedó escrito
 * en `notas` como "1:14:00 p. m.".
 *
 * La causa es que 'es-DO' elige el FORMATO (día/mes/año, a. m./p. m.), no la
 * zona horaria. `toLocaleString('es-DO')` a secas usa la zona del proceso, que
 * en el servidor es UTC. Los cuatro puntos de diferencia son exactamente el
 * offset de República Dominicana.
 *
 * Estos tests fijan la hora de entrada como instante absoluto (con Z), así que
 * su resultado no depende de la zona en que corra Jest — que es justamente la
 * propiedad que faltaba.
 */

/** 22 de agosto de 2026, 09:14 de la mañana en RD. */
const NUEVE_CATORCE_RD = new Date('2026-08-22T13:14:00Z');

describe('fechaHoraRD', () => {
  it('EL BUG: 9:14 a.m. en RD no puede imprimirse como 1:14 p.m.', () => {
    const texto = fechaHoraRD(NUEVE_CATORCE_RD);
    expect(texto).toContain('9:14');
    expect(texto).not.toContain('1:14');
    expect(texto).toContain('22/8/2026');
  });

  it('el sufijo es a. m., no p. m.', () => {
    expect(fechaHoraRD(NUEVE_CATORCE_RD).toLowerCase()).toContain('a. m.');
  });

  it('deja de depender de la zona del proceso — es la diferencia con toLocaleString a secas', () => {
    // Lo que hacía el código roto, simulado tal cual con la zona del servidor.
    const roto = NUEVE_CATORCE_RD.toLocaleString('es-DO', { timeZone: 'UTC' });
    expect(roto).toContain('1:14');           // así se escribió en producción
    expect(fechaHoraRD(NUEVE_CATORCE_RD)).not.toBe(roto);
  });
});

describe('fechaTextoRD', () => {
  it('a las 9pm RD sigue siendo el mismo día, no el siguiente', () => {
    // 2026-08-22 21:00 RD = 2026-08-23 01:00 UTC. Sin zona, un reporte
    // generado el sábado por la noche se fecharía el domingo.
    const sabadoNoche = new Date('2026-08-23T01:00:00Z');
    expect(fechaTextoRD(sabadoNoche)).toContain('22/8/2026');
    expect(sabadoNoche.toLocaleDateString('es-DO', { timeZone: 'UTC' })).toContain('23/8/2026');
  });

  it('respeta las opciones de formato que le pasen', () => {
    expect(fechaTextoRD(NUEVE_CATORCE_RD, { month: 'long', year: 'numeric' }))
      .toContain('agosto');
  });
});

describe('horaTextoRD y fechaYHoraRD — pies de PDF y comandas', () => {
  it('la hora del pie de un PDF va en RD, no en la del servidor', () => {
    expect(horaTextoRD(NUEVE_CATORCE_RD)).toContain('9:14');
    expect(horaTextoRD(NUEVE_CATORCE_RD)).not.toContain('1:14');
  });

  it('fechaYHoraRD junta las dos sin volver a equivocarse de zona', () => {
    const t = fechaYHoraRD(NUEVE_CATORCE_RD);
    expect(t).toContain('22/8/2026');
    expect(t).toContain('9:14');
  });

  it('acepta opciones propias — p. ej. con segundos', () => {
    const conSeg = horaTextoRD(new Date('2026-08-22T13:14:05Z'),
      { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    expect(conSeg).toContain('9:14:05');
  });
});
