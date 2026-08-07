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

export type SessionEndReason = 'expired' | 'displaced';

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
