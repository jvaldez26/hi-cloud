import api from './client';
import type { LoginResponse, ApiResponse } from '../types';

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', { email, password });
    return res.data.data;
  },

  profile: async () => {
    const res = await api.get<ApiResponse<{ user: LoginResponse['user'] }>>('/auth/profile');
    return res.data.data.user;
  },

  register: async (
    nombre: string, email: string, password: string,
    empresaNombre?: string, empresaRnc?: string,
  ) => {
    const res = await api.post('/auth/register', {
      nombre, email, password,
      ...(empresaNombre && { empresaNombre }),
      ...(empresaRnc    && { empresaRnc }),
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
