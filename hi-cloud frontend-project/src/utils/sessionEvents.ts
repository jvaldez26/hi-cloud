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
 * /login, para no perder lo que el usuario tenía a medio teclear.
 *
 * Devuelve `true` si el usuario volvió a autenticarse con éxito (la
 * petición original se reintenta) o `false` si canceló / agotó intentos —
 * ese `false` es lo que dispara el logout real, con el carrito conservado.
 *
 * Dos niveles:
 *   - POR DEFECTO: <ReautenticacionGlobalModal>, montado una sola vez en el
 *     layout raíz (ver App.tsx) — cubre CUALQUIER pantalla.
 *   - ESPECÍFICO: el POS registra el suyo propio (reusa pantallaBloqueada,
 *     para no perder una venta a medio teclear) mientras está montado.
 *
 * El específico pisa al por defecto mientras vive; al desregistrarse (pasar
 * `null`) NO se queda sin ninguno — vuelve al por defecto. Sin esto, salir
 * del POS después de haberlo usado una vez dejaba la sesión entera sin
 * reautenticación in-place por el resto de la sesión del navegador.
 */
type ReauthHandler = () => Promise<boolean>;
let _reauthHandler:        ReauthHandler | null = null;
let _reauthHandlerPorDefecto: ReauthHandler | null = null;

/** @param esPorDefecto Solo lo pasa <ReautenticacionGlobalModal> — ver comentario arriba. */
export function registerReauthHandler(fn: ReauthHandler | null, esPorDefecto = false): void {
  if (esPorDefecto) {
    // Solo tocar el activo si el por defecto YA era el activo — si hay un
    // específico (POS) activo, un cambio al por defecto no debe pisarlo.
    const porDefectoEraElActivo = _reauthHandler === _reauthHandlerPorDefecto;
    _reauthHandlerPorDefecto = fn;
    if (porDefectoEraElActivo) _reauthHandler = fn;
    return;
  }
  _reauthHandler = fn ?? _reauthHandlerPorDefecto;
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
 * Autorización de supervisor bajo demanda: cuando el backend rechaza una
 * petición con 403 y `supervisorClaveRequerida` (ver RequiereSupervisor en
 * el backend), el interceptor de Axios pide, SIN que la pantalla que hizo la
 * llamada sepa de antemano que hacía falta, que se autorice esa clave — y si
 * se autoriza, reintenta la MISMA petición con el token en el header.
 *
 * Mismo patrón que la reautenticación de arriba (handler registrado por un
 * componente React, el interceptor hace `await` sobre una función puente que
 * no sabe nada de React) — con una diferencia: aquí la promesa resuelve con
 * `{ ok, token? }`, no solo `boolean`, porque el interceptor necesita el
 * token para adjuntarlo a la petición reintentada.
 *
 * PILA, no un solo handler (bug real, 2026-10-09 — empresa 73, Bellamar
 * González): la versión anterior asumía "Modo Supervisor solo existe dentro
 * del POS", así que un solo registrador bastaba. Pero cualquier pantalla
 * fuera del POS (Caja Diaria, por ejemplo) puede recibir el mismo 403 — y
 * sin un handler registrado ahí, `solicitarAutorizacionSupervisor` devolvía
 * `{ok:false}` de inmediato: la cajera veía el mensaje del backend ("requiere
 * autorización...") sin ningún modal para dársela — indistinguible de "no
 * tienes permiso", sin ningún camino hacia adelante.
 *
 * Ahora <SupervisorAuthModal/> se monta UNA VEZ en App.tsx (capa base,
 * siempre activa) y el POS sigue montando su propia instancia más rica
 * encima — se empuja a la pila al montar, se saca al desmontar. Siempre se
 * usa la de más arriba (la más específica mientras esté montada); al
 * desmontar el POS, la de App.tsx queda visible de nuevo — nunca llega a 0.
 */
export interface AutorizacionSupervisorResultado { ok: boolean; token?: string }
type SupervisorAuthHandler = (clave: string, action: string, detail?: string) => Promise<AutorizacionSupervisorResultado>;
const _supervisorAuthHandlers: SupervisorAuthHandler[] = [];

/** Lo registra useSupervisor.ts al montar y lo desregistra al desmontar — puede haber más de una instancia montada a la vez. */
export function pushSupervisorAuthHandler(fn: SupervisorAuthHandler): () => void {
  _supervisorAuthHandlers.push(fn);
  return () => {
    const i = _supervisorAuthHandlers.lastIndexOf(fn);
    if (i !== -1) _supervisorAuthHandlers.splice(i, 1);
  };
}

/**
 * @deprecated usar pushSupervisorAuthHandler — se mantiene por si algo
 * externo lo importa directamente. Replica la semántica del ref único de
 * antes (último registro gana, `null` lo quita): saca su propio registro
 * previo de la pila antes de empujar el nuevo, en vez de acumularlos.
 */
let _legacyUnregister: (() => void) | null = null;
export function registerSupervisorAuthHandler(fn: SupervisorAuthHandler | null): void {
  if (_legacyUnregister) { _legacyUnregister(); _legacyUnregister = null; }
  if (fn) _legacyUnregister = pushSupervisorAuthHandler(fn);
}

/** Llamado por el interceptor de Axios ante un 403 con supervisorClaveRequerida. */
export async function solicitarAutorizacionSupervisor(
  clave: string, action: string, detail?: string,
): Promise<AutorizacionSupervisorResultado> {
  const handler = _supervisorAuthHandlers[_supervisorAuthHandlers.length - 1];
  if (!handler) return { ok: false };
  try {
    return await handler(clave, action, detail);
  } catch {
    return { ok: false };
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
