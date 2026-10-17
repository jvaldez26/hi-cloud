/**
 * Preferencia de sonido de autorizaciones — por usuario, mismo criterio que
 * `hc_pin_hint_dismissed_${id}` (POSPage.tsx): un dispositivo compartido
 * entre varios supervisores no debe activar el sonido para todos solo
 * porque uno de ellos lo activó una vez.
 */
export function claveSonidoAutorizacion(userId: number): string {
  return `hc_sonido_autorizacion_${userId}`;
}

export function leerPreferenciaSonido(userId: number): 'on' | 'off' | null {
  try {
    return (localStorage.getItem(claveSonidoAutorizacion(userId)) as 'on' | 'off' | null) ?? null;
  } catch {
    return null; // Safari privado, etc. — nunca romper la pantalla por esto
  }
}

export function guardarPreferenciaSonido(userId: number, valor: 'on' | 'off'): void {
  try { localStorage.setItem(claveSonidoAutorizacion(userId), valor); } catch { /* ignore */ }
}
