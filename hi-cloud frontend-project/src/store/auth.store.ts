import { create } from 'zustand';
import type { AuthUser } from '../types';
import apiClient from '../api/client';

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
  user:          AuthUser | null;
  empresaActual: number | null;
  empresas:      EmpresaItem[];
  hydrated:      boolean;   // true = ya llamamos GET /auth/me

  login:            (user: AuthUser, empresaActual?: number | null, empresas?: EmpresaItem[]) => void;
  logout:           () => void;
  isAuth:           () => boolean;
  cambiarEmpresa:   (empresaId: number) => void;
  getEmpresaActual: () => EmpresaItem | undefined;
  setHydrated:      (v: boolean) => void;
  updateUser:       (partial: Partial<AuthUser>) => void;
}

// Solo guardamos info de UI (NO el token — ahora vive en cookie httpOnly)
const savedUser     = (() => { try { return localStorage.getItem('auth_user'); } catch { return null; } })();
const savedEmpresa  = (() => { try { return localStorage.getItem('empresaId'); } catch { return null; } })();
const savedEmpresas = (() => { try { return localStorage.getItem('mis_empresas'); } catch { return null; } })();

export const useAuthStore = create<AuthState>((set, get) => ({
  user:          savedUser     ? (JSON.parse(savedUser) as AuthUser) : null,
  empresaActual: savedEmpresa  ? Number(savedEmpresa) : null,
  empresas:      savedEmpresas ? (JSON.parse(savedEmpresas) as EmpresaItem[]) : [],
  hydrated:      false,

  login: (user, empresaActual, empresas = []) => {
    // Token NO se guarda — está en cookie httpOnly, JS no puede verlo
    localStorage.setItem('auth_user', JSON.stringify(user));

    if (empresaActual) {
      localStorage.setItem('empresaId',    String(empresaActual));
      localStorage.setItem('mis_empresas', JSON.stringify(empresas));
    } else {
      localStorage.removeItem('empresaId');
      localStorage.removeItem('mis_empresas');
    }

    set({ user, empresaActual: empresaActual ?? null, empresas, hydrated: true });
  },

  logout: () => {
    // Revocar tokens en el servidor — fire-and-forget para no bloquear la UI.
    // El backend invalida el refreshToken en BD y limpia las cookies httpOnly.
    apiClient.post('/auth/logout').catch(() => {/* ignora si el token ya expiró */});
    localStorage.removeItem('auth_user');
    localStorage.removeItem('empresaId');
    localStorage.removeItem('mis_empresas');
    localStorage.removeItem('hicloud-sidebar-group');  // estado accordion (legacy)
    set({ user: null, empresaActual: null, empresas: [], hydrated: true });
    _onLogout?.();
  },

  isAuth: () => !!get().user,

  cambiarEmpresa: (empresaId) => {
    localStorage.setItem('empresaId', String(empresaId));
    set(state => ({ empresaActual: empresaId }));
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
