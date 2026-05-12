import axios, { AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Helpers ────────────────────────────────────────────────────────
/** Decodifica el payload del JWT sin verificar firma. */
function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

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
  // Array de mensajes de validación (class-validator)
  if (Array.isArray(data.message) && data.message.length > 0) {
    return data.message[0];
  }
  return 'Error desconocido del servidor';
}

// ─── REQUEST interceptor ────────────────────────────────────────────
// Inyecta JWT + empresa activa. Si falta empresaId, lo extrae del JWT.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  let empresaId = localStorage.getItem('empresaId');

  if (token && !empresaId) {
    const payload = jwtPayload(token);
    if (payload?.empresaId && payload.empresaId !== null) {
      empresaId = String(payload.empresaId);
      localStorage.setItem('empresaId', empresaId);
    }
  }

  if (token)     config.headers.Authorization  = `Bearer ${token}`;
  if (empresaId) config.headers['X-Empresa-ID'] = empresaId;

  return config;
});

// ─── RESPONSE interceptor ────────────────────────────────────────────
let _recuperandoEmpresa = false;

apiClient.interceptors.response.use(
  (res) => res,

  async (err: AxiosError) => {
    const status  = err.response?.status;
    const data    = err.response?.data as any;
    const message = extractBackendMessage(err);

    // ── 401: sesión expirada ─────────────────────────────────────
    if (status === 401) {
      // Limpiar todo antes de redirigir — evita flash de UI autenticada
      localStorage.removeItem('access_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('empresaId');
      localStorage.removeItem('mis_empresas');
      // Solo redirigir si no estamos ya en /login (evita loop infinito)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
      return Promise.reject(err);
    }

    // ── 403 por empresa SUSPENDIDA → mostrar error y desconectar ────
    if (status === 403 && message.toLowerCase().includes('suspendida')) {
      // Limpiar sesión y mostrar mensaje en la pantalla de login
      localStorage.removeItem('access_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('empresaId');
      localStorage.removeItem('mis_empresas');
      // Guardar el mensaje para mostrarlo en la pantalla de login
      sessionStorage.setItem(
        'login_error',
        'Esta empresa ha sido suspendida. Contacte al administrador de la plataforma HiCloud.',
      );
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
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
        const token = localStorage.getItem('access_token');
        const resp  = await axios.get(`${API_URL}/multi-empresa/mis-empresas`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
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
      case 403: enrichedErr.friendlyMessage = message.toLowerCase().includes('empresa')
        ? message : 'No tienes permisos para esta acción'; break;
      case 404: enrichedErr.friendlyMessage = message || 'Registro no encontrado'; break;
      case 409: enrichedErr.friendlyMessage = message || 'Ya existe un registro con esos datos'; break;
      case 422: enrichedErr.friendlyMessage = message; break;
      case 500: enrichedErr.friendlyMessage = message !== 'Error interno del servidor'
        ? message : 'Error interno del servidor. Contacte soporte si persiste.'; break;
      default:  enrichedErr.friendlyMessage = message;
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
