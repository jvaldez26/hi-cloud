/**
 * Bus de eventos de sesión.
 *
 * Permite que el interceptor de Axios (client.ts, fuera del árbol de React)
 * notifique al enrutador (dentro del árbol) cuando la sesión termina, sin
 * crear la dependencia circular client.ts → auth.store.ts → client.ts.
 *
 * Flujo:
 *   client.ts          →  markNavigatingAway() + emitSessionEnd(reason)
 *   SessionExpiredHandler (App.tsx)  →  logout() + navigate('/login')
 *
 * La bandera `isNavigatingAway` la leen:
 *   - beforeSend de Sentry  → descarta eventos de teardown (no son bugs)
 *   - ErrorBoundary         → renderiza null en vez de pantalla de crash
 *   - el propio interceptor → evita un doble-ciclo de refresh/logout
 */

/**
 * Por qué terminó la sesión. NINGUNA de las tres la pidió el cajero — las
 * tres conservan el carrito del POS (ver App.tsx, SessionExpiredHandler):
 * solo el logout voluntario y el cambio de usuario lo borran (y ninguno de
 * los dos pasa por aquí — llaman logout() directamente).
 *
 *   'expired'   — el refresh no pudo renovar la sesión: un 401 real del
 *                 refresh token, o reintentos agotados sin poder confirmar
 *                 ni descartar (429/5xx/red), y tampoco se pudo reautenticar
 *                 in-place (ver solicitarReautenticacion más abajo).
 *   'displaced' — el usuario entró desde otro dispositivo (SESION_DESPLAZADA)
 *                 o traía un token sin sessionToken (TOKEN_OBSOLETO).
 *   'caducada'  — la sesión llegó a su tope absoluto o al límite de inactividad.
 */
export type SessionEndReason = 'expired' | 'displaced' | 'caducada';

type SessionEndListener = (reason: SessionEndReason) => void;
let _listener: SessionEndListener | null = null;

/** Registrado por <SessionExpiredHandler> una vez montado el BrowserRouter. */
export function onSessionEnd(fn: SessionEndListener | null): void {
  _listener = fn;
}

/** Llamado por el interceptor de Axios cuando la sesión termina definitivamente. */
export function emitSessionEnd(reason: SessionEndReason): void {
  _listener?.(reason);
}

/**
 * Reautenticación in-place: cuando el refresh automático no pudo renovar la
 * sesión (401 real, o reintentos agotados), el interceptor le da a la
 * pantalla activa la oportunidad de pedir la contraseña SIN navegar a
 * /login — hoy solo el POS registra un handler (reusa pantallaBloqueada),
 * para no perder una venta a medio teclear. Cualquier otra pantalla, al no
 * tener handler registrado, cae directo al logout normal (ver client.ts).
 *
 * Devuelve `true` si el usuario volvió a autenticarse con éxito (la
 * petición original se reintenta) o `false` si canceló / agotó intentos —
 * ese `false` es lo que dispara el logout real, con el carrito conservado.
 */
type ReauthHandler = () => Promise<boolean>;
let _reauthHandler: ReauthHandler | null = null;

export function registerReauthHandler(fn: ReauthHandler | null): void {
  _reauthHandler = fn;
}

export async function solicitarReautenticacion(): Promise<boolean> {
  if (!_reauthHandler) return false;
  try {
    return await _reauthHandler();
  } catch {
    return false;
  }
}

/**
 * true en cuanto se inicia el logout suave — se queda así hasta el siguiente
 * page load (no necesita reset porque el soft-navigate no recarga la página;
 * en /login el componente ya carga fresco con isNavigatingAway = false del
 * módulo re-importado; y en hard-navigate la página se descarga entera).
 *
 * Nota: si el componente que llama a navigate('/login') se monta de nuevo
 * en la misma página (ej. Suspense retry), la bandera sigue activa — eso es
 * lo correcto, no queremos re-renderizar pantallas de error en esa ventana.
 */
export let isNavigatingAway = false;

export function markNavigatingAway(): void {
  isNavigatingAway = true;
}
