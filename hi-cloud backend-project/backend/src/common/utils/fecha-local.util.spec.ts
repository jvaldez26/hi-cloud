import { fechaHoraRD, fechaTextoRD, horaTextoRD, fechaYHoraRD, diferenciaDiasRD, fechaHoyRD } from './fecha-local.util';

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

/**
 * EL BUG REAL: FAC-124 (empresa 59) quedó fechada "2027-09-07" por un año mal
 * tecleado. La factura se emitió igual, y hasta DGII la aceptó así — el error
 * solo salió a la luz al intentar la Nota de Crédito, que rechaza referencias
 * a fechas futuras (ver e34.builder.ts). diferenciaDiasRD es la pieza que
 * ahora corta esto ANTES, al emitir (ver facturas.service.ts).
 *
 * No hay parámetro de "ahora" inyectable —usa fechaHoyRD() por dentro—, así
 * que las fechas de prueba se calculan relativas a hoy, no fijas: el test
 * tiene que valer sin importar qué día corra.
 */
describe('diferenciaDiasRD', () => {
  const sumarDiasISO = (dias: number) => {
    const [y, m, d] = fechaHoyRD().split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d + dias, 12));
    return fecha.toISOString().slice(0, 10);
  };

  it('hoy mismo da 0', () => {
    expect(diferenciaDiasRD(fechaHoyRD())).toBe(0);
  });

  it('EL BUG: un año en el futuro (el caso real de FAC-124) da negativo, no una excepción', () => {
    const unAnoAdelante = sumarDiasISO(365);
    expect(diferenciaDiasRD(unAnoAdelante)).toBeLessThan(-300);
  });

  it('una fecha en el pasado da positivo', () => {
    expect(diferenciaDiasRD(sumarDiasISO(-40))).toBe(40);
  });

  it('una fecha en el futuro da negativo, con el mismo valor absoluto', () => {
    expect(diferenciaDiasRD(sumarDiasISO(40))).toBe(-40);
  });

  it('acepta un Date igual que un string ISO', () => {
    const iso = sumarDiasISO(-10);
    const comoDate = new Date(`${iso}T00:00:00.000Z`);
    expect(diferenciaDiasRD(comoDate)).toBe(diferenciaDiasRD(iso));
  });

  it('no cruza de día por el desfase UTC-4 de RD — el motivo del ancla al mediodía', () => {
    // Sin anclar a mediodía, restar dos medianoches UTC puede quedar a medio
    // día de diferencia y redondear para el lado equivocado justo en el borde.
    expect(diferenciaDiasRD(sumarDiasISO(30))).toBe(-30);
    expect(diferenciaDiasRD(sumarDiasISO(31))).toBe(-31);
  });
});
