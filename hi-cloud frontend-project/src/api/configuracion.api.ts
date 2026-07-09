import api from './client';

export const configuracionApi = {
  getEmpresa: () =>
    api.get('/configuracion/empresa').then(r => r.data.data),

  updateEmpresa: (body: Record<string, unknown>) =>
    api.patch('/configuracion/empresa', body).then(r => r.data.data),

  verificarRNC: (rnc: string) =>
    api.get(`/configuracion/empresa/verificar-rnc/${rnc}`).then(r => r.data.data),

  uploadLogo: (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/configuracion/empresa/upload-logo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data);
  },

  removeLogo: () =>
    api.patch('/configuracion/empresa', { logo: null }).then(r => r.data.data),

  uploadFavicon: (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/configuracion/empresa/upload-favicon', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data);
  },

  getSistema: () =>
    api.get('/configuracion/sistema').then(r => r.data.data),

  getSistemaGrupo: (grupo: string) =>
    api.get(`/configuracion/sistema/grupo/${grupo}`).then(r => r.data.data),

  updateParam: (clave: string, valor: string) =>
    api.patch(`/configuracion/sistema/${clave}`, { valor }).then(r => r.data.data),

  getSucursales: () =>
    api.get('/configuracion/sucursales').then(r => r.data.data),

  createSucursal: (body: Record<string, unknown>) =>
    api.post('/configuracion/sucursales', body).then(r => r.data.data),

  getInfo: () =>
    api.get('/configuracion/info').then(r => r.data.data),

  // ── Equipo ──────────────────────────────────────────────────────────────────
  getEquipo: (empresaId: number) =>
    api.get(`/multi-empresa/${empresaId}/usuarios`).then(r => r.data?.data?.data ?? r.data?.data ?? r.data),

  getInvitaciones: (empresaId: number) =>
    api.get(`/invitaciones/empresa/${empresaId}`).then(r => r.data?.data?.data ?? r.data?.data ?? r.data),

  invitar: (body: { email: string; rol: string }) =>
    api.post('/invitaciones', body).then(r => r.data?.data?.data ?? r.data?.data ?? r.data),

  cancelarInvitacion: (id: number) =>
    api.delete(`/invitaciones/${id}`).then(r => r.data?.data?.data ?? r.data?.data ?? r.data),

  cambiarRol: (empresaId: number, userId: number, rol: string) =>
    api.patch(`/multi-empresa/${empresaId}/usuarios/${userId}`, { rol }).then(r => r.data?.data?.data ?? r.data?.data ?? r.data),

  removerUsuario: (empresaId: number, userId: number) =>
    api.delete(`/multi-empresa/${empresaId}/usuarios/${userId}`).then(r => r.data?.data?.data ?? r.data?.data ?? r.data),

  // ── e-CF (solo lectura) ─────────────────────────────────────────────────────
  getECFConfig: (empresaId: number) =>
    api.get(`/ecf/config/empresas/${empresaId}`).then(r => r.data?.data?.data ?? r.data?.data ?? r.data).catch(() => null),

  getECFSecuencias: (empresaId: number) =>
    api.get(`/ecf/config/empresas/${empresaId}/secuencias`).then(r => r.data?.data?.data ?? r.data?.data ?? r.data).catch(() => []),

  // ── Suscripción (solo lectura) ──────────────────────────────────────────────
  getSuscripcion: () =>
    api.get('/suscripciones/mi-plan').then(r => r.data?.data?.data ?? r.data?.data ?? r.data).catch(() => null),

  // ── Auditoría reciente (solo lectura) ──────────────────────────────────────
  getAuditoriaReciente: () =>
    api.get('/auditoria?limit=20&niveles=CRITICO,IMPORTANTE').then(r => r.data?.data?.data ?? r.data?.data ?? r.data).catch(() => []),
};
