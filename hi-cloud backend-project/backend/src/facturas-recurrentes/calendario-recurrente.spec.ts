import { Frecuencia } from './entities/factura-recurrente.entity';
import {
  primeraGeneracion, siguienteGeneracion, ciclosSaltados,
  diaDelMes, diasDelMes, diaSemanaDe, sumarDias, aFechaISO,
} from './calendario-recurrente';

const mensual = (diaMes: number, fechaInicio: string) => ({
  frecuencia: Frecuencia.MENSUAL, diaMes, fechaInicio,
});

describe('calendario-recurrente', () => {
  describe('diaDelMes — el caso de febrero y los meses de 30', () => {
    it('respeta el día cuando el mes llega', () => {
      expect(diaDelMes(2026, 1, 31)).toBe('2026-01-31');
      expect(diaDelMes(2026, 3, 15)).toBe('2026-03-15');
    });

    it('cae en el último día del mes cuando no llega — nunca se salta el mes', () => {
      expect(diaDelMes(2026, 2, 31)).toBe('2026-02-28');
      expect(diaDelMes(2026, 4, 31)).toBe('2026-04-30');
      expect(diaDelMes(2026, 9, 31)).toBe('2026-09-30');
    });

    it('conoce los bisiestos', () => {
      expect(diasDelMes(2028, 2)).toBe(29);
      expect(diaDelMes(2028, 2, 30)).toBe('2028-02-29');
      expect(diasDelMes(2100, 2)).toBe(28);   // 2100 no es bisiesto
    });
  });

  describe('siguienteGeneracion — mensual', () => {
    it('avanza un mes conservando el día', () => {
      expect(siguienteGeneracion(mensual(5, '2026-01-05'), '2026-01-05')).toBe('2026-02-05');
    });

    it('el día 31 no desborda a marzo saltándose febrero', () => {
      // El cálculo anterior hacía setMonth(+1) sobre el 31 de enero, que en JS
      // desborda al 3 de marzo, y acotaba después: febrero desaparecía.
      expect(siguienteGeneracion(mensual(31, '2026-01-31'), '2026-01-31')).toBe('2026-02-28');
    });

    it('vuelve al día elegido en cuanto el mes lo permite', () => {
      const regla = mensual(31, '2026-01-31');
      expect(siguienteGeneracion(regla, '2026-02-28')).toBe('2026-03-31');
      expect(siguienteGeneracion(regla, '2026-03-31')).toBe('2026-04-30');
      expect(siguienteGeneracion(regla, '2026-04-30')).toBe('2026-05-31');
    });

    it('cruza el fin de año', () => {
      expect(siguienteGeneracion(mensual(15, '2026-01-15'), '2026-12-15')).toBe('2027-01-15');
    });

    it('siempre devuelve una fecha estrictamente posterior', () => {
      let cursor = '2026-01-31';
      const regla = mensual(31, '2026-01-31');
      for (let i = 0; i < 40; i++) {
        const sig = siguienteGeneracion(regla, cursor);
        expect(sig > cursor).toBe(true);
        cursor = sig;
      }
    });
  });

  describe('primeraGeneracion — el día manda, no la fecha de inicio', () => {
    it('si el día elegido aún no pasó este mes, sale este mes', () => {
      expect(primeraGeneracion(mensual(25, '2026-08-20'))).toBe('2026-08-25');
    });

    it('si ya pasó, sale el mes que viene — antes salía el mismo día del arranque', () => {
      expect(primeraGeneracion(mensual(5, '2026-08-20'))).toBe('2026-09-05');
    });

    it('el mismo día de arranque cuenta', () => {
      expect(primeraGeneracion(mensual(20, '2026-08-20'))).toBe('2026-08-20');
    });

    it('día 31 arrancando en febrero', () => {
      expect(primeraGeneracion(mensual(31, '2026-02-01'))).toBe('2026-02-28');
    });
  });

  describe('semanal', () => {
    const semanal = (diaSemana: number, fechaInicio: string) => ({
      frecuencia: Frecuencia.SEMANAL, diaSemana, fechaInicio,
    });

    it('1=lunes … 7=domingo', () => {
      expect(diaSemanaDe('2026-08-31')).toBe(1);   // lunes
      expect(diaSemanaDe('2026-08-30')).toBe(7);   // domingo
    });

    it('la primera cae en el próximo día de la semana pedido', () => {
      // 2026-08-30 es domingo; el próximo miércoles (3) es el 2 de septiembre.
      expect(primeraGeneracion(semanal(3, '2026-08-30'))).toBe('2026-09-02');
    });

    it('luego avanza de siete en siete', () => {
      expect(siguienteGeneracion(semanal(3, '2026-08-30'), '2026-09-02')).toBe('2026-09-09');
    });
  });

  describe('anual', () => {
    const anual = (diaMes: number, fechaInicio: string) => ({
      frecuencia: Frecuencia.ANUAL, diaMes, fechaInicio,
    });

    it('no se desplaza de mes con los años', () => {
      const regla = anual(15, '2026-03-15');
      expect(siguienteGeneracion(regla, '2026-03-15')).toBe('2027-03-15');
      expect(siguienteGeneracion(regla, '2027-03-15')).toBe('2028-03-15');
    });

    it('un 29 de febrero anual cae en el 28 los años no bisiestos', () => {
      const regla = anual(29, '2028-02-29');
      expect(siguienteGeneracion(regla, '2028-02-29')).toBe('2029-02-28');
    });
  });

  describe('diaria', () => {
    const diaria = { frecuencia: Frecuencia.DIARIA, fechaInicio: '2026-08-30' };

    it('arranca el mismo día de inicio y avanza de uno en uno', () => {
      expect(primeraGeneracion(diaria)).toBe('2026-08-30');
      expect(siguienteGeneracion(diaria, '2026-08-31')).toBe('2026-09-01');
    });
  });

  describe('ciclosSaltados — la caída del servidor deja constancia', () => {
    it('sin atraso no cuenta nada', () => {
      expect(ciclosSaltados(mensual(5, '2026-01-05'), '2026-08-05', '2026-08-05')).toBe(0);
    });

    it('tres días caído en una plantilla diaria = 3 ciclos saltados', () => {
      const diaria = { frecuencia: Frecuencia.DIARIA, fechaInicio: '2026-08-01' };
      expect(ciclosSaltados(diaria, '2026-08-27', '2026-08-30')).toBe(3);
    });

    it('dos meses sin correr una mensual = 2 ciclos saltados', () => {
      expect(ciclosSaltados(mensual(5, '2026-01-05'), '2026-06-05', '2026-08-05')).toBe(2);
    });

    it('no se cuelga con una fecha corrompida al pasado remoto', () => {
      const diaria = { frecuencia: Frecuencia.DIARIA, fechaInicio: '2000-01-01' };
      expect(ciclosSaltados(diaria, '2000-01-01', '2026-08-30')).toBe(500);
    });
  });

  describe('utilidades', () => {
    it('sumarDias cruza meses y años', () => {
      expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
      expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
      expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    });

    it('aFechaISO acepta Date, string y timestamp de la BD', () => {
      expect(aFechaISO(new Date(2026, 7, 30))).toBe('2026-08-30');
      expect(aFechaISO('2026-08-30')).toBe('2026-08-30');
      expect(aFechaISO('2026-08-30T00:00:00.000Z')).toBe('2026-08-30');
      expect(aFechaISO(null)).toBeNull();
    });
  });
});
