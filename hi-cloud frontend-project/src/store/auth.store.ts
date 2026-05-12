import { create } from 'zustand';
import type { AuthUser } from '../types';

// Callback registrado por App.tsx para limpiar React Query al cerrar sesión.
// Evita el acoplamiento circular sin usar require dinámico.
let _onLogout: (() => void) | null = null;
export function registerLogoutCallback(fn: () => void) { _onLogout = fn; }

/** Verifica que el JWT exista y no esté expirado — sin dependencias externas. */
function tokenValido(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) return true;                      // sin exp → confiar
    return payload.exp * 1000 > Date.now() + 30_000;    // margen 30s para latencia
  } catch {
    return false;
  }
}

interface EmpresaItem {
  empresaId:   number;
  nombre:      string;
  rnc?:        string;
  rol:         string;
  isPrincipal: boolean;
  plan?:       string;
}

interface AuthState {
  user:          AuthUser | null;
  token:         string | null;
  empresaActual: number | null;
  empresas:      EmpresaItem[];

  login:          (token: string, user: AuthUser, empresaActual?: number | null, empresas?: EmpresaItem[]) => void;
  logout:         () => void;
  isAuth:         () => boolean;
  cambiarEmpresa: (empresaId: number, newToken?: string) => void;
  getEmpresaActual: () => EmpresaItem | undefined;
}

const savedToken    = localStorage.getItem('access_token');
// Si el token guardado está expirado, limpiamos localStorage antes de inicializar
if (savedToken && !tokenValido(savedToken)) {
  localStorage.removeItem('access_token');
  localStorage.removeItem('auth_user');
  localStorage.removeItem('empresaId');
  localStorage.removeItem('mis_empresas');
}
const savedUser     = tokenValido(savedToken) ? localStorage.getItem('auth_user') : null;
const savedEmpresa  = tokenValido(savedToken) ? localStorage.getItem('empresaId') : null;
const savedEmpresas = tokenValido(savedToken) ? localStorage.getItem('mis_empresas') : null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user:          savedUser     ? (JSON.parse(savedUser) as AuthUser) : null,
  token:         savedToken    ?? null,
  empresaActual: savedEmpresa  ? Number(savedEmpresa) : null,
  empresas:      savedEmpresas ? (JSON.parse(savedEmpresas) as EmpresaItem[]) : [],

  login: (token, user, empresaActual, empresas = []) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('auth_user',    JSON.stringify(user));

    if (empresaActual) {
      localStorage.setItem('empresaId',    String(empresaActual));
      localStorage.setItem('mis_empresas', JSON.stringify(empresas));
    } else {
      // Sin empresa → limpiar residuos de sesiones anteriores
      localStorage.removeItem('empresaId');
      localStorage.removeItem('mis_empresas');
    }

    set({ token, user, empresaActual: empresaActual ?? null, empresas });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('empresaId');
    localStorage.removeItem('mis_empresas');
    set({ token: null, user: null, empresaActual: null, empresas: [] });
    _onLogout?.();   // limpia React Query cache para aislar sesiones
  },

  isAuth: () => tokenValido(get().token),

  cambiarEmpresa: (empresaId, newToken) => {
    localStorage.setItem('empresaId', String(empresaId));
    if (newToken) {
      localStorage.setItem('access_token', newToken);
    }
    set(state => ({ empresaActual: empresaId, token: newToken ?? state.token }));
  },

  getEmpresaActual: () => {
    const state = get();
    return state.empresas.find(e => e.empresaId === state.empresaActual);
  },
}));
