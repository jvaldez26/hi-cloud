/**
 * Regresion — ELIDO (empresa 73): pago completo y la fecha no se movia.
 *
 * Su historial:
 *   CARGO  Renovacion plan Plus, ciclo 05/10/2026 → 05/11/2026 ... +7,600
 *   CARGO  Activacion e-CF                        ... +2,400
 *   MANUAL Pago plan Plus, 08/10/2026             ... -10,000
 *
 * El doble conteo en pantalla ya lo arreglo 8ce6fa9b (construirEstadoCuenta
 * descuenta los ciclos que ya tienen cargo). Lo que seguia roto es la otra
 * mitad: el pago liquidaba el cargo de renovacion pero NO extendia
 * suscripciones."fechaVencimiento", asi que el cliente quedaba "Vencida hace
 * 4 dias. Tu ultimo pago cubrio hasta 05/10/2026" — en el ciclo que acababa
 * de pagar.
 *
 * Causa: imputarPago reparte en dos pasos (1. cargos FIFO, 2. periodos con el
 * REMANENTE). Un cargo de renovacion se come el remanente en el paso 1, asi
 * que al paso 2 no le queda nada: periodos = 0 y nuevaFecha = null. Pero ese
 * cargo ERA el periodo.
 */

import { imputarPago, vencimientoPorCiclosLiquidados } from './imputacion-pago.util';

const CICLO_INICIO = '2026-10-05';
const CICLO_FIN    = '2026-11-05';
const HOY          = '2026-10-09';

/** Los dos cargos de ELIDO, en el orden en que se crearon (FIFO). */
const CARGOS_ELIDO = [
  { id: 1, concepto: 'Renovación plan Plus — ciclo 05/10/2026 al 05/11/2026',
    saldoPendiente: 7600, periodoFin: CICLO_FIN },
  { id: 2, concepto: 'Activación e-CF', saldoPendiente: 2400, periodoFin: null },
];

const BASE = {
  abonoDisponible:  0,
  precioMensual:    7600,
  venceSuscripcion: CICLO_INICIO,
  diaCorte:         5,
  modalidad:        'mensual',
  hoy:              HOY,
};

describe('pago que cubre la renovación de un ciclo', () => {
  it('RD$10,000 liquidan los dos cargos y el vencimiento avanza al fin del ciclo', () => {
    const r = imputarPago({ ...BASE, monto: 10000, cargosPendientes: CARGOS_ELIDO });

    // Los 10,000 se van íntegros a cargos: al paso de períodos no le queda nada.
    expect(r.montoACargos).toBe(10000);
    expect(r.periodos).toBe(0);
    expect(r.nuevaFecha).toBeNull();
    expect(r.abonoFinal).toBe(0);
    expect(r.cargosLiquidados.every(c => c.saldoRestante === 0)).toBe(true);

    // Y aun así el ciclo quedó pagado: la fecha tiene que avanzar.
    expect(vencimientoPorCiclosLiquidados(r.cargosLiquidados, CICLO_INICIO)).toBe(CICLO_FIN);
  });

  it('un pago PARCIAL deja saldo y no extiende el vencimiento', () => {
    // 5,000 no alcanzan ni para el cargo de renovación (7,600).
    const r = imputarPago({ ...BASE, monto: 5000, cargosPendientes: CARGOS_ELIDO });

    expect(r.cargosLiquidados[0].saldoRestante).toBe(2600);
    expect(vencimientoPorCiclosLiquidados(r.cargosLiquidados, CICLO_INICIO)).toBeNull();
  });

  it('pagar solo un cargo por servicios no mueve la fecha — no compra tiempo de plan', () => {
    const r = imputarPago({ ...BASE, monto: 2400, cargosPendientes: [CARGOS_ELIDO[1]] });

    expect(r.cargosLiquidados[0].saldoRestante).toBe(0);
    expect(vencimientoPorCiclosLiquidados(r.cargosLiquidados, CICLO_INICIO)).toBeNull();
  });

  it('con varios ciclos pagados de una vez, avanza al más lejano', () => {
    const r = imputarPago({
      ...BASE, monto: 15200,
      cargosPendientes: [
        { id: 1, concepto: 'Renovación ciclo 1', saldoPendiente: 7600, periodoFin: '2026-11-05' },
        { id: 2, concepto: 'Renovación ciclo 2', saldoPendiente: 7600, periodoFin: '2026-12-05' },
      ],
    });

    expect(vencimientoPorCiclosLiquidados(r.cargosLiquidados, CICLO_INICIO)).toBe('2026-12-05');
  });

  it('nunca retrocede: un ciclo viejo ya cubierto no mueve nada', () => {
    const r = imputarPago({
      ...BASE, monto: 7600,
      cargosPendientes: [
        { id: 9, concepto: 'Renovación vieja', saldoPendiente: 7600, periodoFin: '2026-08-05' },
      ],
    });

    expect(vencimientoPorCiclosLiquidados(r.cargosLiquidados, CICLO_INICIO)).toBeNull();
  });

  it('el pago que SÍ deja remanente sigue avanzando períodos como antes', () => {
    // 20,000: 10,000 a cargos y 10,000 al plan → 1 período (7,600) + abono.
    const r = imputarPago({ ...BASE, monto: 20000, cargosPendientes: CARGOS_ELIDO });

    expect(r.periodos).toBeGreaterThanOrEqual(1);
    expect(r.nuevaFecha).not.toBeNull();
    // Y el ciclo del cargo liquidado no lo hace retroceder.
    const porCiclo = vencimientoPorCiclosLiquidados(r.cargosLiquidados, CICLO_INICIO);
    expect(porCiclo).toBe(CICLO_FIN);
    expect(r.nuevaFecha! >= porCiclo!).toBe(true);
  });
});
