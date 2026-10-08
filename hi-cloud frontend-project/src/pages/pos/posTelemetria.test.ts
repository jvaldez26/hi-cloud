import { describe, it, expect } from 'vitest';
import {
  debeAlertarLongtask, debeAlertarMuestraPeriodica, horasAbiertaDesde,
  registrarVentaCompletada, registrarAccionPOS,
  debeAlertarImpresionLenta, debeAvisarImpresionPendienteAlVolver,
  obtenerPestanasVivasConocidas,
} from './posTelemetria';

describe('debeAlertarLongtask', () => {
  it('2000ms exactos NO alerta — el umbral es estrictamente mayor que 2s', () => {
    expect(debeAlertarLongtask(2000)).toBe(false);
  });
  it('2001ms sí alerta', () => {
    expect(debeAlertarLongtask(2001)).toBe(true);
  });
  it('un long task corto (200ms, normal en cualquier app) no alerta', () => {
    expect(debeAlertarLongtask(200)).toBe(false);
  });
});

describe('debeAlertarMuestraPeriodica', () => {
  it('todo sano (heap bajo, pocos nodos) — no alerta, no genera ruido', () => {
    expect(debeAlertarMuestraPeriodica({ heapMB: 40, domNodes: 900 })).toBe(false);
  });
  it('heap por encima del umbral — alerta aunque el DOM esté sano', () => {
    expect(debeAlertarMuestraPeriodica({ heapMB: 250, domNodes: 900 })).toBe(true);
  });
  it('nodos DOM por encima del umbral — alerta aunque la memoria esté sana', () => {
    expect(debeAlertarMuestraPeriodica({ heapMB: 40, domNodes: 6000 })).toBe(true);
  });
  it('performance.memory no disponible (heapMB null) — solo mira domNodes', () => {
    expect(debeAlertarMuestraPeriodica({ heapMB: null, domNodes: 900 })).toBe(false);
    expect(debeAlertarMuestraPeriodica({ heapMB: null, domNodes: 6000 })).toBe(true);
  });
});

describe('horasAbiertaDesde', () => {
  it('calcula horas transcurridas con un decimal', () => {
    const abiertaEn = 1_000_000;
    const ahora     = abiertaEn + 3.5 * 3_600_000; // 3.5 horas después
    expect(horasAbiertaDesde(abiertaEn, ahora)).toBe(3.5);
  });
  it('recién abierta (0ms transcurridos) da 0', () => {
    expect(horasAbiertaDesde(1_000_000, 1_000_000)).toBe(0);
  });
});

describe('registrarVentaCompletada / registrarAccionPOS', () => {
  it('no lanzan — son funciones de registro sin valor de retorno', () => {
    expect(() => registrarVentaCompletada()).not.toThrow();
    expect(() => registrarAccionPOS('cobro_iniciado')).not.toThrow();
  });
});

describe('debeAlertarImpresionLenta', () => {
  it('una impresión normal (bajo 5s) no alerta', () => {
    expect(debeAlertarImpresionLenta(1200)).toBe(false);
  });
  it('una impresión que tardó más de 5s sí alerta', () => {
    expect(debeAlertarImpresionLenta(5001)).toBe(true);
  });
});

describe('obtenerPestanasVivasConocidas — decisión 2026-10-08: varias pestañas del POS, sin aviso', () => {
  it('antes de arrancar la telemetría no hay ninguna otra pestaña conocida — nunca un falso positivo', () => {
    expect(obtenerPestanasVivasConocidas()).toEqual([]);
  });
});

describe('debeAvisarImpresionPendienteAlVolver', () => {
  it('sin impresión pendiente (null) — no avisa', () => {
    expect(debeAvisarImpresionPendienteAlVolver(null)).toBe(false);
  });
  it('impresión pendiente reciente (bajo 3s) — todavía no avisa', () => {
    expect(debeAvisarImpresionPendienteAlVolver(1000)).toBe(false);
  });
  it('impresión pendiente hace más de 3s al volver — avisa', () => {
    expect(debeAvisarImpresionPendienteAlVolver(3001)).toBe(true);
  });
});
