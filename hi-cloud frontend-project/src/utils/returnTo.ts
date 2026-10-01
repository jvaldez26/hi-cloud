/**
 * "Volver a donde estaba" tras un cierre de sesión involuntario (ver
 * SessionExpiredHandler en App.tsx y ReautenticacionGlobalModal). Guarda la
 * ruta ANTES de navegar a /login y la consume una sola vez tras el próximo
 * login exitoso — por cualquiera de las puertas (LoginPage, Google,
 * SetupPasswordPage), ya que un cierre de sesión en medio de un formulario
 * puede terminar reingresando por cualquiera de las tres.
 */
const CLAVE = 'hc-return-to';

/**
 * Solo rutas internas. `//evil.com` es una URL protocol-relative — el
 * navegador la trata como "mismo esquema, otro host", así que un simple
 * `startsWith('/')` no basta: hay que rechazar también el doble slash.
 */
export function esRutaInternaSegura(path: string | null | undefined): boolean {
  return !!path && path.startsWith('/') && !path.startsWith('//');
}

export function guardarReturnTo(path: string): void {
  if (!esRutaInternaSegura(path)) return;
  try { sessionStorage.setItem(CLAVE, path); } catch { /* sessionStorage no disponible — no es crítico */ }
}

/** Devuelve la ruta guardada (si es válida) y la borra — se usa una sola vez. */
export function consumirReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(CLAVE);
    sessionStorage.removeItem(CLAVE);
    return esRutaInternaSegura(v) ? v : null;
  } catch {
    return null;
  }
}
