import api from './client';

export const auditoriaApi = {
  logs: (
    p = 1,
    limit = 20,
    accion?: string,
    modulo?: string,
    exitoso?: boolean,
    niveles?: string,
  ) => {
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (accion  !== undefined) params.append('accion',  accion);
    if (modulo  !== undefined) params.append('modulo',  modulo);
    if (exitoso !== undefined) params.append('exitoso', String(exitoso));
    if (niveles !== undefined) params.append('niveles', niveles);
    return api.get(`/auditoria?${params}`).then(r => r.data.data);
  },

  resumen: () =>
    api.get('/auditoria/resumen').then(r => r.data.data),

  errores: (limite = 10) =>
    api.get(`/auditoria/errores?limite=${limite}`).then(r => r.data.data),

  porUsuario: (userId: number, p = 1, limit = 20) =>
    api.get(`/auditoria/usuario/${userId}?page=${p}&limit=${limit}`).then(r => r.data.data),

  porModulo: (modulo: string, p = 1, limit = 20) =>
    api.get(`/auditoria/modulo/${modulo}?page=${p}&limit=${limit}`).then(r => r.data.data),
};
