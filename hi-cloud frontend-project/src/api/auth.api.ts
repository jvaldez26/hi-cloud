import api from './client';
import type { LoginResponse, ApiResponse } from '../types';

export const authApi = {
  /** `identificador`: correo o nombre de usuario, en el mismo campo — el
   *  backend decide cuál es mirando si contiene '@' (LoginDto.identificador). */
  login: async (identificador: string, password: string, forceLogin?: boolean) => {
    // S-23: backend setea cookie httpOnly — response solo contiene user info
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', { identificador, password, ...(forceLogin ? { forceLogin: true } : {}) });
    return res.data.data as (LoginResponse & {
      requiresTwoFactor?: boolean;
      requiresSessionConfirmation?: boolean;
      activeSession?: { device?: string; ipAddress?: string; lastActivityAt?: string };
    }) | null;
  },

  complete2FALogin: async (codigo: string) => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/2fa/complete-login', { codigo });
    return res.data.data;
  },

  logout: async () => {
    // fetch nativo con keepalive:true → sobrevive al cierre de pestaña o navegación.
    // Axios no soporta keepalive; native fetch sí, y con credentials:'include' envía
    // la cookie access_token httpOnly que el backend necesita para autenticar.
    const base = (api.defaults.baseURL ?? '/api/v1').replace(/\/$/, '');
    await fetch(`${base}/auth/logout`, {
      method:      'POST',
      credentials: 'include',
      keepalive:   true,        // el browser encola la petición aunque la página cierre
    });
  },

  me: async () => {
    // S-23: verifica cookie y retorna info del usuario
    const res = await api.get('/auth/me');
    return res.data?.data?.user ?? res.data?.user ?? res.data;
  },

  profile: async () => {
    const res = await api.get<ApiResponse<{ user: LoginResponse['user'] }>>('/auth/profile');
    return res.data.data.user;
  },

  register: async (
    nombre: string, email: string, password: string,
    empresaNombre?: string, empresaRnc?: string,
    planElegido?: string,
    telefono?: string,
    sectorEmpresarial?: string,
  ) => {
    const res = await api.post('/auth/register', {
      nombre, email, password,
      ...(empresaNombre      && { empresaNombre }),
      ...(empresaRnc         && { empresaRnc }),
      ...(planElegido        && { planElegido }),
      ...(telefono           && { telefono }),
      ...(sectorEmpresarial  && { sectorEmpresarial }),
    });
    return res.data;
  },

  forgotPassword: async (email: string) => {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data?.data ?? res.data;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const res = await api.post(`/auth/reset-password/${token}`, { password: newPassword });
    return res.data?.data ?? res.data;
  },

  verifyEmail: async (token: string) => {
    const res = await api.post('/auth/verify-email', { token });
    return res.data?.data ?? res.data;
  },

  /** Acepta email O userId — el login por username nunca recibe el correo
   *  completo del usuario (solo enmascarado), así que ese flujo reenvía por
   *  userId y el backend resuelve el correo real internamente. */
  resendVerification: async (target: { email?: string; userId?: number }) => {
    const res = await api.post('/auth/resend-verification', target);
    return res.data?.data ?? res.data;
  },

  usernameDisponible: async (valor: string) => {
    const res = await api.get('/auth/username-disponible', { params: { valor } });
    return (res.data?.data ?? res.data) as { disponible: boolean };
  },

  setUsername: async (username: string) => {
    const res = await api.patch('/auth/username', { username });
    return (res.data?.data ?? res.data) as { username: string };
  },

  cambiarEmpresa: async (empresaId: number) => {
    const res = await api.post('/auth/cambiar-empresa', { empresaId });
    return res.data?.data ?? res.data;
  },

  misEmpresas: async () => {
    const res = await api.get('/multi-empresa/mis-empresas');
    return (res.data?.data ?? res.data) as Array<{
      empresaId: number; nombre: string; rnc?: string;
      rol: string; isPrincipal: boolean; plan?: string;
    }>;
  },
};
