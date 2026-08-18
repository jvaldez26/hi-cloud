import axios, { AxiosError } from 'axios';
import * as Sentry from '@sentry/react';
import { moduloActual } from '../observability/sentryScope';
import { emitSessionEnd, markNavigatingAway, isNavigatingAway } from '../utils/sessionEvents';

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

// ─── RESPONSE interceptor ────────────────────────────────────────────
let _recuperandoEmpresa = false;

apiClient.interceptors.response.use(
  (res) => res,

  async (err: AxiosError) => {
    const status  = err.response?.status;
    const message = extractBackendMessage(err);

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

      // Sesión desplazada: el usuario inició sesión en otro dispositivo
      // El filter devuelve { errors: ["SESION_DESPLAZADA"] }, no { message: "..." }
      // → usar `message` (ya extraído de errors[0] por extractBackendMessage)
      if (message === 'SESION_DESPLAZADA') {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('empresaId');
        localStorage.removeItem('mis_empresas');
        sessionStorage.setItem(
          'login_error',
          'Tu sesión fue cerrada porque iniciaste sesión en otro dispositivo. ' +
          'Si no fuiste tú, cambia tu contraseña inmediatamente.',
        );
        if (!window.location.pathname.startsWith('/login')) {
          markNavigatingAway();
          emitSessionEnd('displaced');
        }
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

      if (!isAuthEndpoint && !original?._retry && !onPublicPage) {
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

        // ── Esta pestaña hace el refresh ──────────────────────────────────────
        _isRefreshing = true;
        _setTabRefreshState('running');

        try {
          await apiClient.post('/auth/refresh');
          _setTabRefreshState('done');
          _bc?.postMessage({ type: 'hc_refresh_done' });
          processRefreshQueue(null);
          return apiClient(original);
        } catch (refreshErr) {
          _setTabRefreshState('failed');
          _bc?.postMessage({ type: 'hc_refresh_failed' });
          processRefreshQueue(refreshErr);
          // Refresh falló definitivamente → fallthrough al logout
        } finally {
          _isRefreshing = false;
          setTimeout(_clearTabRefreshState, 3_000);
        }
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
      } catch { /* */ }
      _recuperandoEmpresa = false;
    }

    // ── Enriquecer el error con mensaje claro ────────────────────
    // El objeto error ahora tiene .friendlyMessage para que los componentes
    // puedan mostrarlo directamente sin parsear la respuesta.
    const enrichedErr = err as any;
    switch (status) {
      case 400: enrichedErr.friendlyMessage = message; break;
      case 403: {
        const m403 = message.toLowerCase();
        enrichedErr.friendlyMessage = (
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
