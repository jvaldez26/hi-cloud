import { create } from 'zustand';
import type { AuthUser } from '../types';
import { syncSentryScope } from '../observability/sentryScope';

// Callback registrado por App.tsx para limpiar React Query al cerrar sesión.
let _onLogout: (() => void) | null = null;
export function registerLogoutCallback(fn: () => void) { _onLogout = fn; }

interface EmpresaItem {
  empresaId:   number;
  nombre:      string;
  rnc?:        string;
  rol:         string;
  isPrincipal: boolean;
  plan?:       string;
}

interface AuthState {
  user:            AuthUser | null;
  empresaActual:   number | null;
  empresas:        EmpresaItem[];
  almacenActual:   number | null;
  sucursalActual:  number | null;
  sucursalNombre:  string | null;
  hydrated:        boolean;   // true = ya llamamos GET /auth/me

  login:             (user: AuthUser, empresaActual?: number | null, empresas?: EmpresaItem[], almacenActual?: number | null, sucursalActual?: number | null, sucursalNombre?: string | null) => void;
  logout:            () => void;
  isAuth:            () => boolean;
  cambiarEmpresa:    (empresaId: number) => void;
  setSucursalActual: (sucursalId: number) => void;
  setSucursalNombre: (nombre: string | null) => void;
  setAlmacenActual:  (almacenId: number | null) => void;
  getEmpresaActual:  () => EmpresaItem | undefined;
  setHydrated:       (v: boolean) => void;
  updateUser:        (partial: Partial<AuthUser>) => void;
}

// Solo guardamos info de UI (NO el token — ahora vive en cookie httpOnly)
const savedUser          = (() => { try { return localStorage.getItem('auth_user'); } catch { return null; } })();
const savedEmpresa       = (() => { try { return localStorage.getItem('empresaId'); } catch { return null; } })();
const savedEmpresas      = (() => { try { return localStorage.getItem('mis_empresas'); } catch { return null; } })();
const savedAlmacen       = (() => { try { return localStorage.getItem('almacenId'); } catch { return null; } })();
const savedSucursal      = (() => { try { return localStorage.getItem('sucursalId'); } catch { return null; } })();
const savedSucursalNom   = (() => { try { return localStorage.getItem('sucursalNombre'); } catch { return null; } })();

export const useAuthStore = create<AuthState>((set, get) => ({
  user:           savedUser     ? (JSON.parse(savedUser) as AuthUser) : null,
  empresaActual:  savedEmpresa  ? Number(savedEmpresa) : null,
  empresas:       savedEmpresas ? (JSON.parse(savedEmpresas) as EmpresaItem[]) : [],
  almacenActual:  savedAlmacen  ? Number(savedAlmacen) : null,
  sucursalActual: savedSucursal ? Number(savedSucursal) : null,
  sucursalNombre: savedSucursalNom ?? null,
  hydrated:       false,

  login: (user, empresaActual, empresas = [], almacenActual?, sucursalActual?, sucursalNombre?) => {
    // Token NO se guarda — está en cookie httpOnly, JS no puede verlo
    localStorage.setItem('auth_user', JSON.stringify(user));

    if (empresaActual) {
      localStorage.setItem('empresaId',    String(empresaActual));
      localStorage.setItem('mis_empresas', JSON.stringify(empresas));
    } else {
      localStorage.removeItem('empresaId');
      localStorage.removeItem('mis_empresas');
    }

    if (almacenActual)   localStorage.setItem('almacenId',      String(almacenActual));
    else                 localStorage.removeItem('almacenId');
    if (sucursalActual)  localStorage.setItem('sucursalId',     String(sucursalActual));
    else                 localStorage.removeItem('sucursalId');
    if (sucursalNombre)  localStorage.setItem('sucursalNombre', sucursalNombre);
    else                 localStorage.removeItem('sucursalNombre');

    set({ user, empresaActual: empresaActual ?? null, empresas, almacenActual: almacenActual ?? null, sucursalActual: sucursalActual ?? null, sucursalNombre: sucursalNombre ?? null, hydrated: true });
  },

  logout: () => {
    // Solo limpieza local. La llamada al servidor (authApi.logout() con keepalive:true)
    // es responsabilidad del llamador (handleLogout en AppLayout / PortalEmpleadoLayout).
    // SessionExpiredHandler y el interceptor de SESION_DESPLAZADA llaman logout()
    // directamente porque el servidor ya invalidó la sesión — no necesitan notificarle.
    localStorage.removeItem('auth_user');
    localStorage.removeItem('empresaId');
    localStorage.removeItem('mis_empresas');
    localStorage.removeItem('almacenId');
    localStorage.removeItem('sucursalId');
    localStorage.removeItem('sucursalNombre');
    localStorage.removeItem('hicloud-sidebar-group');  // estado accordion (legacy)
    // Limpiar estado del POS para que el próximo usuario no vea datos del anterior
    localStorage.removeItem('pos_supervisor');   // sesión de supervisor
    localStorage.removeItem('pos_cajero_nombre');
    localStorage.removeItem('pos_vendedor_id');
    localStorage.removeItem('hc_empresa_nombre');
    // SEGURIDAD MULTI-TENANT: limpiar carrito activo para que no sobreviva entre empresas
    localStorage.removeItem('pos-carrito-activo');
    sessionStorage.removeItem('pos_turno');
    sessionStorage.removeItem('pos_bloqueado');
    set({ user: null, empresaActual: null, empresas: [], almacenActual: null, sucursalActual: null, hydrated: true });
    _onLogout?.();
  },

  isAuth: () => !!get().user,

  cambiarEmpresa: (empresaId) => {
    localStorage.setItem('empresaId', String(empresaId));
    set(state => {
      const empresaInfo = state.empresas.find(e => e.empresaId === empresaId);
      const newUser = state.user && empresaInfo
        ? { ...state.user, role: empresaInfo.rol as AuthUser['role'] }
        : state.user;
      if (newUser !== state.user) localStorage.setItem('auth_user', JSON.stringify(newUser));
      return { empresaActual: empresaId, user: newUser };
    });
  },

  setSucursalActual: (sucursalId) => {
    localStorage.setItem('sucursalId', String(sucursalId));
    set(() => ({ sucursalActual: sucursalId }));
  },

  setSucursalNombre: (nombre) => {
    if (nombre) localStorage.setItem('sucursalNombre', nombre);
    else        localStorage.removeItem('sucursalNombre');
    set(() => ({ sucursalNombre: nombre }));
  },

  setAlmacenActual: (almacenId) => {
    if (almacenId != null) localStorage.setItem('almacenId', String(almacenId));
    else localStorage.removeItem('almacenId');
    set(() => ({ almacenActual: almacenId }));
  },

  getEmpresaActual: () => {
    const state = get();
    return state.empresas.find(e => e.empresaId === state.empresaActual);
  },

  setHydrated: (v) => set({ hydrated: v }),

  /** Actualiza campos del usuario en memoria + localStorage sin re-login completo. */
  updateUser: (partial) => {
    set(state => {
      if (!state.user) return {};
      const updated = { ...state.user, ...partial };
      localStorage.setItem('auth_user', JSON.stringify(updated));
      return { user: updated };
    });
  },
}));

// ── Observabilidad: mantener el scope de Sentry (usuario/empresa/sucursal) en
// sincronía con el store, para que TODO evento del frontend lleve contexto.
// Una vez al cargar (estado hidratado desde localStorage) + en cada cambio.
syncSentryScope(useAuthStore.getState());
useAuthStore.subscribe((s) => syncSentryScope(s));
