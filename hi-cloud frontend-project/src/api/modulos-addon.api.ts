import api from './client';

export const modulosAddonApi = {
  listar: () =>
    api.get('/modulos').then(r => r.data as { id: number; codigo: string; nombre: string; descripcion: string }[]),

  check: (codigo: string) =>
    api.get<{ codigo: string; activo: boolean }>(`/modulos/check/${codigo}`).then(r => r.data),

  // Super Admin
  getModulosEmpresa: (empresaId: number) =>
    api.get(`/admin/empresas/${empresaId}/modulos`).then(r => r.data),

  activarModulo: (empresaId: number, codigo: string, fechaVencimiento?: string, notas?: string) =>
    api.post(`/admin/empresas/${empresaId}/modulos/activar`, { codigo, fechaVencimiento, notas }).then(r => r.data),

  desactivarModulo: (empresaId: number, codigo: string) =>
    api.post(`/admin/empresas/${empresaId}/modulos/desactivar`, { codigo }).then(r => r.data),
};
