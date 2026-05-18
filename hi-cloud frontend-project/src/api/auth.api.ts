import api from './client';
import type { LoginResponse, ApiResponse } from '../types';

export const authApi = {
  login: async (email: string, password: string) => {
    // S-23: backend setea cookie httpOnly — response solo contiene user info
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', { email, password });
    return res.data.data as (LoginResponse & { requiresTwoFactor?: boolean }) | null;
  },

  complete2FALogin: async (codigo: string) => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/2fa/complete-login', { codigo });
    return res.data.data;
  },

  logout: async () => {
    // S-23: backend limpia la cookie httpOnly access_token
    await api.post('/auth/logout');
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
  ) => {
    const res = await api.post('/auth/register', {
      nombre, email, password,
      ...(empresaNombre && { empresaNombre }),
      ...(empresaRnc    && { empresaRnc }),
      ...(planElegido   && { planElegido }),
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

  resendVerification: async (email: string) => {
    const res = await api.post('/auth/resend-verification', { email });
    return res.data?.data ?? res.data;
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
