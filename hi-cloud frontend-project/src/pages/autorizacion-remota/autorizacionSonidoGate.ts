/**
 * Motor puro de decisión del sonido de "autorización pendiente" — separado
 * de Audio/Notification/document.title a propósito, para poder probarlo
 * sin tocar ninguna API del navegador (ver el pedido explícito: "tests del
 * flujo de notificación, sin el audio real").
 *
 * Reglas: suena al llegar una solicitud nueva, se repite cada 30s mientras
 * siga pendiente y SIN ABRIR, y se detiene sola al responderla (ya no
 * aparece en `pendientes`), al vencer (filtrado aquí mismo) o al abrirla
 * (marcada en `vistas`).
 */

export const INTERVALO_REPETICION_SONIDO_MS = 30_000;

export interface SolicitudParaSonido {
  id: number;
  /** epoch ms — mismo criterio que SolicitudAutorizacionRemota.expiraEn. */
  expiraEnMs: number;
}

/**
 * Devuelve los ids de las solicitudes que deben sonar AHORA: pendientes,
 * no vencidas, no vistas, y (nunca sonaron antes O ya pasó el intervalo de
 * repetición desde la última vez que sonaron).
 */
export function solicitudesQueDebenSonar(
  pendientes: SolicitudParaSonido[],
  vistas: ReadonlySet<number>,
  ultimoSonidoMs: Readonly<Record<number, number>>,
  ahoraMs: number,
): number[] {
  return pendientes
    .filter(s => s.expiraEnMs > ahoraMs)
    .filter(s => !vistas.has(s.id))
    .filter(s => {
      const ultimo = ultimoSonidoMs[s.id];
      return ultimo == null || (ahoraMs - ultimo) >= INTERVALO_REPETICION_SONIDO_MS;
    })
    .map(s => s.id);
}

/** true si hay al menos una pendiente sin ver y sin vencer — gobierna el parpadeo del título y el badge. */
export function hayPendientesSinVer(
  pendientes: SolicitudParaSonido[],
  vistas: ReadonlySet<number>,
  ahoraMs: number,
): boolean {
  return pendientes.some(s => s.expiraEnMs > ahoraMs && !vistas.has(s.id));
}

/** Cuenta de pendientes sin ver — para el texto "(N) Autorización pendiente" del título. */
export function contarPendientesSinVer(
  pendientes: SolicitudParaSonido[],
  vistas: ReadonlySet<number>,
  ahoraMs: number,
): number {
  return pendientes.filter(s => s.expiraEnMs > ahoraMs && !vistas.has(s.id)).length;
}
