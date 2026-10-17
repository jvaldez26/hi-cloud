import { describe, it, expect } from 'vitest';
import {
  solicitudesQueDebenSonar, hayPendientesSinVer, contarPendientesSinVer,
  INTERVALO_REPETICION_SONIDO_MS, type SolicitudParaSonido,
} from './autorizacionSonidoGate';

/**
 * Motor puro del sonido de "autorización pendiente" — sin Audio/Notification
 * reales a propósito (pedido explícito del usuario: "tests del flujo de
 * notificación, sin el audio real"). Cubre los 3 escenarios pedidos:
 * sonido solicitado al llegar, repetición mientras pendiente, se detiene
 * al responder o vencer.
 */
const AHORA = 1_000_000;
const vacio = new Set<number>();

function sol(id: number, vencesEnMs: number): SolicitudParaSonido {
  return { id, expiraEnMs: AHORA + vencesEnMs };
}

describe('solicitudesQueDebenSonar', () => {
  it('suena al llegar una solicitud nueva (nunca sonó antes)', () => {
    const ids = solicitudesQueDebenSonar([sol(1, 60_000)], vacio, {}, AHORA);
    expect(ids).toEqual([1]);
  });

  it('NO vuelve a sonar antes de los 30s de la última vez', () => {
    const ultimo = { 1: AHORA - 10_000 }; // sonó hace 10s
    const ids = solicitudesQueDebenSonar([sol(1, 60_000)], vacio, ultimo, AHORA);
    expect(ids).toEqual([]);
  });

  it('se repite justo al cumplirse el intervalo de 30s', () => {
    const ultimo = { 1: AHORA - INTERVALO_REPETICION_SONIDO_MS };
    const ids = solicitudesQueDebenSonar([sol(1, 60_000)], vacio, ultimo, AHORA);
    expect(ids).toEqual([1]);
  });

  it('se detiene al "responderla" — ya no está en la lista de pendientes', () => {
    // Aprobada/rechazada/cancelada: el backend deja de devolverla en
    // /autorizacion-remota/pendientes, así que simplemente no aparece aquí.
    const ids = solicitudesQueDebenSonar([], vacio, { 1: AHORA - 40_000 }, AHORA);
    expect(ids).toEqual([]);
  });

  it('se detiene al vencer — expiraEnMs ya pasó', () => {
    const vencida = sol(1, -1); // expiraEnMs < ahora
    const ids = solicitudesQueDebenSonar([vencida], vacio, {}, AHORA);
    expect(ids).toEqual([]);
  });

  it('se detiene al abrirla — marcada en "vistas"', () => {
    const vistas = new Set([1]);
    const ids = solicitudesQueDebenSonar([sol(1, 60_000)], vistas, {}, AHORA);
    expect(ids).toEqual([]);
  });

  it('varias pendientes: cada una se evalúa independiente', () => {
    const vistas = new Set([2]); // la 2 ya se vio
    const ultimo = { 3: AHORA - 5_000 }; // la 3 sonó hace poco, no toca repetir
    const ids = solicitudesQueDebenSonar(
      [sol(1, 60_000), sol(2, 60_000), sol(3, 60_000), sol(4, -1)],
      vistas, ultimo, AHORA,
    );
    expect(ids.sort()).toEqual([1]); // 2=vista, 3=muy pronto, 4=vencida
  });
});

describe('hayPendientesSinVer / contarPendientesSinVer — gobiernan el parpadeo del título', () => {
  it('true/con conteo cuando hay al menos una pendiente sin ver', () => {
    expect(hayPendientesSinVer([sol(1, 60_000)], vacio, AHORA)).toBe(true);
    expect(contarPendientesSinVer([sol(1, 60_000), sol(2, 60_000)], vacio, AHORA)).toBe(2);
  });

  it('false cuando todas están vistas o vencidas', () => {
    const vistas = new Set([1]);
    expect(hayPendientesSinVer([sol(1, 60_000), sol(2, -1)], vistas, AHORA)).toBe(false);
    expect(contarPendientesSinVer([sol(1, 60_000), sol(2, -1)], vistas, AHORA)).toBe(0);
  });

  it('sin pendientes: false/0', () => {
    expect(hayPendientesSinVer([], vacio, AHORA)).toBe(false);
    expect(contarPendientesSinVer([], vacio, AHORA)).toBe(0);
  });
});
