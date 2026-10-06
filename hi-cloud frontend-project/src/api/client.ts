import axios, { AxiosError } from 'axios';
import { message } from 'antd';
import * as Sentry from '@sentry/react';
import { moduloActual } from '../observability/sentryScope';
import { emitSessionEnd, markNavigatingAway, isNavigatingAway, solicitarReautenticacion, solicitarAutorizacionSupervisor } from '../utils/sessionEvents';
import { registrarHoraServidor } from '../utils/fechaRD';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const apiClient = axios.create({
  baseURL:          API_URL,
  timeout:          15000,
  headers:          { 'Content-Type': 'application/json' },
  withCredentials:  true,   // S-23: enviar cookie httpOnly access_token automáticamente
});

// ─── Helpers ────────────────────────────────────────────────────────
/** Extrae el mensaje de error más descriptivo del backend */
function extractBackendMessage(err: AxiosError): string {
  const data = err.response?.data as any;
  if (!data) return 'Sin respuesta del servidor. Verifica tu conexión.';

  // Array de errores (validación, pg, etc.)
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors[0];
  }
  // Mensaje directo
  if (typeof data.message === 'string' && data.message) {
    return data.message;
  }
  // Límite de ingresos / suscripción (usa 'mensaje' en vez de 'message')
  if (typeof data.mensaje === 'string' && data.mensaje) {
    return data.mensaje;
  }
  // Array de mensajes de validación (class-validator)
  if (Array.isArray(data.message) && data.message.length > 0) {
    return data.message[0];
  }
  return 'Error desconocido del servidor';
}

// ─── REQUEST interceptor ────────────────────────────────────────────
// S-23: el token JWT está en cookie httpOnly — el navegador lo envía automáticamente.
// Solo inyectamos X-Empresa-ID (no es secreto, es routing de multi-tenant).
apiClient.interceptors.request.use((config) => {
  const empresaId = localStorage.getItem('empresaId');
  if (empresaId) config.headers['X-Empresa-ID'] = empresaId;

  // ── Subidas de archivos ──────────────────────────────────────────────────
  //
  // El cliente se crea con 'Content-Type: application/json' por defecto, y si
  // ese header sobrevive a una petición con FormData, axios NO manda el
  // multipart: lo CONVIERTE A JSON. Reproducido con axios 1.18 —
  // transformRequest hace `hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data`
  // y el resultado es literalmente:
  //
  //     {"certificado":{},"clavePfx":"secreta"}
  //
  // El archivo se pierde —un File no tiene serialización JSON— mientras el
  // resto de campos sí viajan. De ahí el desconcertante "falta el archivo" con
  // el archivo seleccionado en pantalla: al backend le llega todo menos él.
  //
  // No es que salga sin boundary; es que no sale.
  //
  // Se borra aquí, en un solo sitio, y NO se sustituye por
  // 'multipart/form-data' escrito a mano: el boundary lo tiene que generar el
  // navegador, y ponerlo a mano es justo donde se falla.
  //
  // Antes cada subida tenía que acordarse de sobreescribirlo. Las que ya lo
  // hacen siguen funcionando —fijar el mismo valor no rompe nada—, pero
  // ninguna nueva puede olvidarse.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    delete (config.headers as any)['content-type'];
  }

  return config;
});

// ─── S-28: Cola intra-pestaña y coordinación inter-pestaña ────────────────
let _isRefreshing   = false;
let _refreshQueue: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

function processRefreshQueue(error: unknown) {
  _refreshQueue.forEach(p => error ? p.reject(error) : p.resolve());
  _refreshQueue = [];
}

// ── Inter-tab: BroadcastChannel + localStorage como fallback ──────────────
// Cuando el access token expira con 2+ pestañas abiertas, solo UNA pestaña
// debe llamar /auth/refresh (el refresh token rota: si dos pestañas lo llaman
// simultáneamente, la segunda recibe 401 porque ya fue revocado).
const _REFRESH_BC   = 'hc-auth-refresh';
const _REFRESH_LS   = 'hc_refresh_state';
const _REFRESH_TTL  = 10_000; // 10 s — si la pestaña refreshing muere

let _bc: BroadcastChannel | null = null;
try { _bc = new BroadcastChannel(_REFRESH_BC); } catch { /* Safari private, etc. */ }

function _getTabRefreshState(): { status: 'running' | 'done' | 'failed'; at: number } | null {
  try { return JSON.parse(localStorage.getItem(_REFRESH_LS) ?? 'null'); } catch { return null; }
}
function _setTabRefreshState(status: 'running' | 'done' | 'failed'): void {
  localStorage.setItem(_REFRESH_LS, JSON.stringify({ status, at: Date.now() }));
}
function _clearTabRefreshState(): void {
  localStorage.removeItem(_REFRESH_LS);
}

function _waitForOtherTabRefresh(): Promise<'done' | 'failed' | 'timeout'> {
  return new Promise(resolve => {
    const timer = setTimeout(() => { cleanup(); resolve('timeout'); }, _REFRESH_TTL);

    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'hc_refresh_done')   { cleanup(); resolve('done'); }
      if (e.data?.type === 'hc_refresh_failed')  { cleanup(); resolve('failed'); }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== _REFRESH_LS) return;
      const s = _getTabRefreshState();
      if (s?.status === 'done')   { cleanup(); resolve('done'); }
      if (s?.status === 'failed') { cleanup(); resolve('failed'); }
    };

    function cleanup() {
      clearTimeout(timer);
      _bc?.removeEventListener('message', onMsg);
      window.removeEventListener('storage', onStorage);
    }

    _bc?.addEventListener('message', onMsg);
    window.addEventListener('storage', onStorage);
  });
}

// ── Reintentos de /auth/refresh con espera creciente ───────────────────────
const REFRESH_MAX_INTENTOS      = 3;
const REFRESH_BACKOFF_BASE_MS   = 1500;
const REFRESH_BACKOFF_MAX_MS    = 8000;
const AVISO_REINTENTO_KEY       = 'hc-auth-reintentando';

function mostrarAvisoReintentando(): void {
  try {
    message.loading({
      content: 'Problema de conexión — reintentando...',
      key:     AVISO_REINTENTO_KEY,
      duration: 0,
    });
  } catch { /* antd aún no montado (muy al inicio de la carga) — no es crítico */ }
}

function ocultarAvisoReintentando(): void {
  try { message.destroy(AVISO_REINTENTO_KEY); } catch { /* no-op */ }
}

/**
 * Reintenta /auth/refresh con espera creciente cuando el fallo NO es un 401
 * — un 429 (el propio límite de refresh), un 500, un timeout o la red
 * caída no significan que el refresh token murió, solo que este intento no
 * se pudo completar. Antes CUALQUIER fallo de refresh —incluido un 429—
 * se trataba exactamente igual que un 401 real: logout inmediato con el
 * carrito del POS perdido (era el bug reportado).
 *
 * Devuelve 'ok' si algún intento tuvo éxito, o 'fallo' si el refresh token
 * está genuinamente muerto (401) o se agotaron los reintentos sin poder
 * confirmarlo ni descartarlo — en ambos casos el llamador (más abajo)
 * intenta reautenticar in-place (solicitarReautenticacion) antes de recién
 * ahí cerrar la sesión.
 */
export async function intentarRefrescarConReintentos(): Promise<'ok' | 'fallo'> {
  for (let intento = 1; intento <= REFRESH_MAX_INTENTOS; intento++) {
    try {
      await apiClient.post('/auth/refresh');
      ocultarAvisoReintentando();
      return 'ok';
    } catch (refreshErr) {
      const ax     = refreshErr as AxiosError;
      const estado = ax.response?.status;

      // eslint-disable-next-line no-console
      console.warn(
        `[auth] refresh fallido (intento ${intento}/${REFRESH_MAX_INTENTOS}, ${estado ?? 'sin respuesta'}):`,
        ax.message ?? refreshErr,
      );

      // Un 401 es lo esperado cuando el refresh token ya no vale — reintentar
      // no cambiaría el resultado. Cualquier otra cosa es un incidente (a
      // Sentry) y sí vale la pena reintentar antes de rendirse.
      if (estado === 401) { ocultarAvisoReintentando(); return 'fallo'; }

      Sentry.captureException(refreshErr, {
        tags:  { modulo: 'auth', fase: 'refresh-token', intento: String(intento) },
        extra: { estado: estado ?? null },
      });

      if (intento === REFRESH_MAX_INTENTOS) { ocultarAvisoReintentando(); return 'fallo'; }

      // Retry-After del 429 manda si viene; si no, backoff exponencial con tope.
      const retryAfterHeader = ax.response?.headers?.['retry-after'];
      const retryAfterMs     = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      const esperaMs = (retryAfterMs && retryAfterMs > 0)
        ? retryAfterMs
        : Math.min(REFRESH_BACKOFF_BASE_MS * 2 ** (intento - 1), REFRESH_BACKOFF_MAX_MS);

      mostrarAvisoReintentando();
      await new Promise(r => setTimeout(r, esperaMs));
    }
  }
  ocultarAvisoReintentando();
  return 'fallo';
}

// ─── RESPONSE interceptor ────────────────────────────────────────────
let _recuperandoEmpresa = false;

apiClient.interceptors.response.use(
  (res) => {
    // Sincronizar el reloj con el servidor. Toda respuesta HTTP trae la
    // cabecera `Date`, así que no hace falta petición ni endpoint extra: la
    // primera llamada de la sesión ya deja la hora buena.
    //
    // Importa porque el reloj de una PC de caja se desajusta —o directamente
    // está mal— y esa hora acaba impresa en el ticket del cliente.
    registrarHoraServidor(res.headers?.date as string | undefined);
    return res;
  },

  async (err: AxiosError) => {
    const status  = err.response?.status;
    const message = extractBackendMessage(err);

    // Marca explícita de "nunca hubo respuesta HTTP" — red caída, timeout,
    // DNS, servidor inalcanzable. mensajeDeError() (utils/mensajeDeError.ts)
    // la usa para no inventar una causa de negocio ("credenciales
    // inválidas", "token inválido"...) cuando el problema real es la
    // conexión. Se fija temprano, antes de cualquier return anticipado.
    (err as any).isNetworkError = !err.response;

    // Un error también trae la cabecera: sirve igual para sincronizar.
    registrarHoraServidor(err.response?.headers?.date as string | undefined);

    // ── 401: access token expirado → intentar refresh automático (S-28) ─────
    if (status === 401) {
      // Si ya iniciamos el logout suave, no hay nada más que hacer — el usuario
      // está camino a /login. Rechazar silenciosamente evita un doble-ciclo
      // de refresh que podría emitir sessionEnd de nuevo.
      if (isNavigatingAway) return Promise.reject(err);

      const original = err.config as any;

      // verificar-supervisor: contraseña incorrecta del supervisor — NO es sesión expirada.
      // Solo rechazar el error para que el modal lo muestre; no hacer refresh ni logout.
      if (original?.url?.includes('/auth/verificar-supervisor')) {
        return Promise.reject(err);
      }

      // Fin de sesión decidido por el backend. Dos códigos, mismo tratamiento:
      // logout limpio, sin reintentos y CONSERVANDO el carrito del POS.
      //
      //   SESION_DESPLAZADA — el usuario inició sesión en otro dispositivo.
      //   TOKEN_OBSOLETO    — el JWT no lleva sessionToken. Solo puede venir de
      //     un token emitido antes de que existiera la sesión única, o por el
      //     bug de cambiarEmpresa/cambiarSucursal que emitía JWT sin el campo.
      //     Esos tokens siguen en los navegadores hasta que expiren, así que
      //     este camino se recorre de verdad tras desplegar el arreglo.
      //
      // El filter devuelve { errors: ["CODIGO"] }, no { message: "..." }
      // → usar `message` (ya extraído de errors[0] por extractBackendMessage)
      // SESION_CADUCADA — la sesión llegó a su tope absoluto o al límite de
      // inactividad del backend. Todavía no lo emite nadie: el backend que lo
      // lanza llega en la Fase B y se enciende por configuración. El cliente lo
      // reconoce desde ya para que el encendido no dependa de un deploy de
      // frontend, y sobre todo para que no borre carritos del POS cuando ocurra.
      if (message === 'SESION_CADUCADA') {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('empresaId');
        localStorage.removeItem('mis_empresas');
        sessionStorage.setItem(
          'login_error',
          'Tu sesión alcanzó su duración máxima y se cerró por seguridad. Vuelve a ' +
          'iniciar sesión. Si tenías una venta en el POS, sigue guardada: la ' +
          'encontrarás en el carrito al entrar.',
        );
        if (!window.location.pathname.startsWith('/login')) {
          markNavigatingAway();
          emitSessionEnd('caducada');   // preserva el carrito del POS
        }
        return Promise.reject(err);
      }

      if (message === 'SESION_DESPLAZADA' || message === 'TOKEN_OBSOLETO') {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('empresaId');
        localStorage.removeItem('mis_empresas');
        sessionStorage.setItem(
          'login_error',
          message === 'TOKEN_OBSOLETO'
            ? 'Tu sesión expiró por una actualización de seguridad. Vuelve a ' +
              'iniciar sesión. Si tenías una venta en el POS, sigue guardada: ' +
              'la encontrarás en el carrito al entrar.'
            : 'Tu usuario inició sesión en otro dispositivo. Esta sesión se cerró. ' +
              'Si tenías una venta en el POS, sigue guardada: vuelve a entrar y la ' +
              'encontrarás en el carrito. Si no fuiste tú quien inició la otra ' +
              'sesión, cambia tu contraseña inmediatamente.',
        );
        if (!window.location.pathname.startsWith('/login')) {
          markNavigatingAway();
          // 'displaced' preserva el carrito del POS (ver auth.store.logout).
          // Aplica igual a TOKEN_OBSOLETO: el cajero tampoco pidió salir.
          emitSessionEnd('displaced');
        }
        // Reject sin reintento: markNavigatingAway() hace que el siguiente 401
        // salga por el early-return de arriba, así que no hay bucle posible.
        return Promise.reject(err);
      }

      // Rutas públicas — no intentar refresh ni redirigir desde ellas
      // '/' se compara exacto (startsWith('/') matchearía todo)
      const publicPaths = ['/login', '/registrar', '/recuperar-contrasena',
                           '/restablecer', '/verificar-correo', '/portal/',
                           '/invitacion/', '/precios', '/auth/callback'];
      const onPublicPage = window.location.pathname === '/' ||
                           publicPaths.some(p => window.location.pathname.startsWith(p));

      // No reintentar en refresh/login ni en páginas públicas para evitar
      // que un refresh_token válido restaure la sesión tras un logout explícito.
      const isAuthEndpoint = original?.url?.includes('/auth/refresh') ||
                             original?.url?.includes('/auth/login')  ||
                             original?.url?.includes('/auth/logout');  // fire-and-forget; no reintentar

      // Una petición al propio /auth/refresh (o login/logout) que falla con
      // 401 NO dispara logout aquí — quien orquesta el refresh (más abajo)
      // decide, porque puede intentar reautenticar in-place antes de
      // rendirse. Antes esto cerraba sesión de inmediato sin darle esa
      // oportunidad al modal de reingreso del POS.
      if (isAuthEndpoint) return Promise.reject(err);

      if (!original?._retry && !onPublicPage) {
        // ── Capa 1: intra-pestaña — encolar si esta pestaña ya está refrescando ─
        if (_isRefreshing) {
          return new Promise<void>((resolve, reject) => {
            _refreshQueue.push({ resolve, reject });
          }).then(() => apiClient(original))
            .catch(e => Promise.reject(e));
        }

        original._retry = true;

        // ── Capa 2: inter-pestaña — esperar si OTRA pestaña ya está refrescando ─
        const tabState = _getTabRefreshState();
        const otherTabBusy = tabState?.status === 'running' &&
                             Date.now() - tabState.at < _REFRESH_TTL;

        if (otherTabBusy) {
          const outcome = await _waitForOtherTabRefresh();
          if (outcome === 'done') return apiClient(original);   // cookie ya renovada
          if (outcome === 'failed') {
            // La otra pestaña falló → fallthrough al logout
          }
          // timeout → la otra pestaña murió, intentamos nosotros mismos
        }

        // ── Esta pestaña hace el refresh, con reintentos ────────────────────
        _isRefreshing = true;
        _setTabRefreshState('running');

        const resultado = await intentarRefrescarConReintentos();

        if (resultado === 'ok') {
          _setTabRefreshState('done');
          _bc?.postMessage({ type: 'hc_refresh_done' });
          processRefreshQueue(null);
          _isRefreshing = false;
          setTimeout(_clearTabRefreshState, 3_000);
          return apiClient(original);
        }

        // resultado === 'fallo' — 401 real del refresh token, o reintentos
        // agotados sin poder confirmarlo ni descartarlo. Antes de cerrar
        // sesión, darle a la pantalla activa (el POS, si está montada) la
        // oportunidad de reautenticar sin perder lo que había en curso.
        const reautenticado = await solicitarReautenticacion();

        _isRefreshing = false;
        setTimeout(_clearTabRefreshState, 3_000);

        if (reautenticado) {
          _setTabRefreshState('done');
          _bc?.postMessage({ type: 'hc_refresh_done' });
          processRefreshQueue(null);
          return apiClient(original);
        }

        _setTabRefreshState('failed');
        _bc?.postMessage({ type: 'hc_refresh_failed' });
        processRefreshQueue(new Error('SESION_INVALIDA'));
        // Sin reautenticación posible → fallthrough al logout
      }
      localStorage.removeItem('auth_user');
      localStorage.removeItem('empresaId');
      localStorage.removeItem('mis_empresas');
      localStorage.removeItem('hicloud-sidebar-group');
      if (!onPublicPage) {
        sessionStorage.setItem(
          'login_error',
          'Tu sesión ha expirado. Por favor inicia sesión de nuevo.',
        );
        markNavigatingAway();
        emitSessionEnd('expired');
      }
      return Promise.reject(err);
    }

    // ── 403 por empresa SUSPENDIDA ────────────────────────────────────────
    // Si el usuario tiene otras empresas activas, limpiar solo el empresaId
    // stale y dejar que AppLayout redirija a la empresa activa disponible.
    // Solo hacer logout completo si no hay otras empresas activas.
    if (status === 403 && message.toLowerCase().includes('suspendida')) {
      const empresaIdActual = localStorage.getItem('empresaId');
      // Limpiar el empresaId stale para que AppLayout detecte el cambio
      localStorage.removeItem('empresaId');

      // Verificar si el usuario tiene otras empresas activas
      const misEmpresasRaw = localStorage.getItem('mis_empresas');
      const misEmpresas: any[] = misEmpresasRaw ? JSON.parse(misEmpresasRaw) : [];
      const otraEmpresaActiva = misEmpresas.find(
        (e: any) => String(e.empresaId) !== String(empresaIdActual),
      );

      if (otraEmpresaActiva) {
        // Tiene otras empresas → actualizar JWT con la empresa activa ANTES de redirigir.
        // Si no se actualiza el JWT, el auto-select del AppLayout dispararía otro reload
        // (ve localStorage sin empresaId y llama cambiarEmpresa → doble recarga).
        const newId = String(otraEmpresaActiva.empresaId);
        localStorage.setItem('empresaId', newId);
        try {
          await fetch(`${API_URL}/auth/cambiar-empresa`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresaId: Number(newId) }),
          });
        } catch { /* si falla, el JWT se actualizará en el próximo ciclo */ }
        window.location.replace('/dashboard');
      } else {
        // Sin otras empresas activas → logout con mensaje
        localStorage.removeItem('auth_user');
        localStorage.removeItem('mis_empresas');
        sessionStorage.setItem(
          'login_error',
          'Esta empresa ha sido suspendida. Contacte al administrador de la plataforma HiCloud.',
        );
        if (!window.location.pathname.startsWith('/login')) {
          markNavigatingAway();
          emitSessionEnd('expired');
        }
      }
      return Promise.reject(err);
    }

    // ── 403 por empresa faltante → recuperar automáticamente ────
    if (
      status === 403 &&
      message.toLowerCase().includes('empresa') &&
      !_recuperandoEmpresa
    ) {
      _recuperandoEmpresa = true;
      try {
        // S-23: withCredentials envía la cookie automáticamente
        const resp = await axios.get(`${API_URL}/multi-empresa/mis-empresas`, {
          withCredentials: true,
        });
        const empresas: any[] = resp.data?.data ?? resp.data ?? [];
        const primera = Array.isArray(empresas) ? empresas[0] : null;
        if (primera?.empresaId) {
          const id = String(primera.empresaId);
          localStorage.setItem('empresaId', id);
          const original = err.config!;
          original.headers['X-Empresa-ID'] = id;
          _recuperandoEmpresa = false;
          return apiClient.request(original);
        }
      } catch (recErr) {
        // Sin esto, el reintento no ocurre y el usuario ve el 401 original sin
        // ninguna pista de que hubo un intento de recuperar la empresa.
        // eslint-disable-next-line no-console
        console.warn('[auth] no se pudo recuperar la empresa activa tras un 401:',
          (recErr as Error)?.message ?? recErr);
      }
      _recuperandoEmpresa = false;
    }

    // ── 403 por falta de autorización de Modo Supervisor (genérico) ──────────
    // RequiereSupervisor (backend) manda supervisorClaveRequerida/supervisorModo
    // en el body del 403 — ninguna pantalla necesita saber de antemano que una
    // clave hacía falta: el interceptor pide la autorización aquí (vía
    // useSupervisor.ts, registrado como handler en sessionEvents.ts, mismo
    // patrón que solicitarReautenticacion) y reintenta la MISMA petición con
    // el token. `_retrySupervisor` es la marca anti-bucle — si el reintento
    // vuelve a dar el mismo 403 (token inválido, cajero canceló, etc.), no se
    // vuelve a intentar: se deja pasar el error tal cual.
    if (status === 403) {
      const data = err.response?.data as any;
      const clave = data?.supervisorClaveRequerida as string | undefined;
      const original = err.config as any;
      if (clave && original && !original._retrySupervisor) {
        original._retrySupervisor = true;
        const resultado = await solicitarAutorizacionSupervisor(clave, clave);
        if (resultado.ok) {
          original.headers = original.headers ?? {};
          if (resultado.token) original.headers['x-supervisor-token'] = resultado.token;
          return apiClient.request(original);
        }
        // Cancelado o sin handler registrado (fuera del POS) → cae al error normal.
      }
    }

    // ── Enriquecer el error con mensaje claro ────────────────────
    // El objeto error ahora tiene .friendlyMessage para que los componentes
    // puedan mostrarlo directamente sin parsear la respuesta.
    const enrichedErr = err as any;
    switch (status) {
      case 400: enrichedErr.friendlyMessage = message; break;
      case 403: {
        const m403 = message.toLowerCase();
        // Un 403 con supervisorClaveRequerida SIEMPRE llega aquí con un
        // mensaje específico y accionable ("Esta venta a crédito requiere
        // ...", "...autorización nueva.") — ya sea porque no había handler
        // de supervisor registrado (fuera del POS) o porque el cajero
        // canceló el modal (ver sessionEvents.ts). Forzar el genérico "No
        // tienes permisos" ahí ocultaba la razón real (caso FAC-1623,
        // 2026-10-06: el cajero nunca entendió que hacía falta un
        // supervisor porque el toast no lo decía).
        const esSupervisorRequerido = !!(err.response?.data as any)?.supervisorClaveRequerida;
        enrichedErr.friendlyMessage = (
          esSupervisorRequerido ||
          m403.includes('empresa') ||
          m403.includes('límite') ||
          m403.includes('limite') ||
          m403.includes('plan') ||
          m403.includes('suspendida') ||
          m403.includes('acceso')
        ) ? message : 'No tienes permisos para esta acción';
        break;
      }
      case 404: enrichedErr.friendlyMessage = message || 'Registro no encontrado'; break;
      case 409: enrichedErr.friendlyMessage = message || 'Ya existe un registro con esos datos'; break;
      case 422: enrichedErr.friendlyMessage = message; break;
      // El backend manda "ThrottlerException: Too Many Requests" crudo —
      // sin esta rama, ese texto interno le llegaba tal cual al usuario.
      case 429: enrichedErr.friendlyMessage = 'Demasiadas solicitudes — espera un momento e inténtalo de nuevo.'; break;
      case 500: enrichedErr.friendlyMessage = message !== 'Error interno del servidor'
        ? message : 'Error interno del servidor. Contacte soporte si persiste.'; break;
      default:  enrichedErr.friendlyMessage = message;
    }

    // Normalizar .message y .response.data.message para que catch blocks que usan
    // e?.response?.data?.message o e?.message obtengan el mensaje amigable
    enrichedErr.message = enrichedErr.friendlyMessage;
    if (enrichedErr.response?.data && typeof enrichedErr.response.data === 'object') {
      enrichedErr.response.data.message = enrichedErr.friendlyMessage;
    }

    // ── Observabilidad: reportar a Sentry solo fallos reales de SERVIDOR (5xx).
    // Los 4xx de negocio/validación NO se envían (ruido), las cancelaciones
    // tampoco, y los errores sin respuesta (ECONNABORTED, ERR_NETWORK, ETIMEDOUT,
    // offline del cliente) también se omiten — son condiciones de red del usuario,
    // no bugs del sistema. Se marca el error como reportado para que el onError
    // global de mutaciones no lo duplique.
    const esCancelacion = axios.isCancel?.(err) || (err as any)?.code === 'ERR_CANCELED';
    // Respuestas generadas por el Service Worker (X-SW-Offline: 1) cuando el dispositivo
    // pierde conectividad. El SW devuelve un 503 sintético — no es un fallo del backend
    // y no aporta al debugging. Marcamos el error para que beforeSend también lo descarte.
    const esSwOffline = err.response?.headers?.['x-sw-offline'] === '1' ||
                        (err.response?.data as any)?.swGenerated === true;
    if (esSwOffline) (enrichedErr as any).swOffline = true;
    const esServidor    = typeof status === 'number' && status >= 500 && !esSwOffline;
    if (!esCancelacion && esServidor) {
      enrichedErr.__sentryReported = true;
      Sentry.captureException(err, {
        tags: {
          origin:      'api',
          http_status: String(status),
          http_method: String(err.config?.method ?? '').toUpperCase() || 'GET',
          modulo:      moduloActual(),
        },
      });
    }

    return Promise.reject(enrichedErr);
  },
);

export default apiClient;

/**
 * Extrae el array de una respuesta del backend, manejando tanto respuestas
 * directas como respuestas paginadas ({ data: T[], meta: {} }).
 *
 * Estructura del backend:
 *   r.data = { success, data: T | { data: T[], meta } | T[], timestamp }
 *
 * Uso en queries de selectores:
 *   queryFn: () => api.get('/clientes?limit=200').then(extractList)
 */
export function extractList<T = any>(r: any): T[] {
  const payload = r?.data?.data ?? r?.data ?? r;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

/**
 * Extrae el objeto de datos de una respuesta del backend.
 * Para endpoints que devuelven un objeto único (no lista).
 */
export function extractData<T = any>(r: any): T {
  return r?.data?.data ?? r?.data ?? r;
}
