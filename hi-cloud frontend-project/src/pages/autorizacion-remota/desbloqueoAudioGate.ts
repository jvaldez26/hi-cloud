/**
 * Reglas puras del desbloqueo automático de audio con el primer gesto del
 * usuario (click/touch/tecla, en cualquier parte de la app) — separadas del
 * listener real de DOM y de Web Audio API para poder probarlas sin
 * simular eventos del navegador.
 */

/** El gesto global solo intenta desbloquear/activar si el usuario nunca lo apagó a mano. */
export function debeIntentarDesbloqueoEnGesto(preferencia: 'on' | 'off' | null): boolean {
  return preferencia !== 'off';
}

/** El aviso "Toca para activar el sonido" solo se muestra si el audio sigue
 *  bloqueado DE VERDAD y el usuario no lo desactivó explícitamente — nunca
 *  por estar en tal o cual pantalla. */
export function debeMostrarAvisoActivarSonido(preferencia: 'on' | 'off' | null, audioDesbloqueado: boolean): boolean {
  return preferencia !== 'off' && !audioDesbloqueado;
}
