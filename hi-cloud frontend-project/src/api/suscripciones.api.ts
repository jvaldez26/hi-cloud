import api from './client';

export const suscripcionesApi = {
  // ── Cliente ────────────────────────────────────────────────────────────────
  miPlan:     () => api.get('/suscripciones/mi-plan').then(r => r.data.data),
  misLimites: () => api.get('/suscripciones/mis-limites').then(r => r.data.data),
  planes:     () => api.get('/suscripciones/planes').then(r => r.data.data),
  miSolicitud:() => api.get('/suscripciones/mi-solicitud').then(r => r.data.data),

  solicitarCambio: (planSolicitado: string, modalidad?: string, comentario?: string) =>
    api.post('/suscripciones/solicitar-cambio', { planSolicitado, modalidad, comentario })
      .then(r => r.data.data),

  // ── Super Admin ────────────────────────────────────────────────────────────
  listarTodas:         () => api.get('/suscripciones').then(r => r.data.data),
  estadisticas:        () => api.get('/suscripciones/estadisticas').then(r => r.data.data),

  // Solicitudes
  listarSolicitudes:          (estado?: string) =>
    api.get('/suscripciones/admin/solicitudes', { params: { estado } }).then(r => r.data.data),
  contarPendientes:           () =>
    api.get('/suscripciones/admin/solicitudes/pendientes/count').then(r => r.data.data),
  aprobarSolicitud:           (id: number, notaInterna?: string) =>
    api.post(`/suscripciones/admin/solicitudes/${id}/aprobar`, { notaInterna }).then(r => r.data.data),
  rechazarSolicitud:          (id: number, motivoRechazo: string) =>
    api.post(`/suscripciones/admin/solicitudes/${id}/rechazar`, { motivoRechazo }).then(r => r.data.data),

  // Pruebas
  listarEmpresasEnPrueba:     () =>
    api.get('/suscripciones/admin/pruebas').then(r => r.data.data),
  extenderPrueba:             (empresaId: number, dias: number) =>
    api.patch(`/suscripciones/admin/${empresaId}/extender-prueba`, { dias }).then(r => r.data.data),

  // Activar / suspender
  activarAdmin:               (empresaId: number, plan: string, meses?: number, notas?: string, modalidad?: string) =>
    api.patch(`/suscripciones/admin/${empresaId}/activar`, { plan, meses, notas, modalidad }).then(r => r.data.data),
  suspenderAdmin:             (empresaId: number, motivo?: string) =>
    api.patch(`/suscripciones/admin/${empresaId}/suspender`, { motivo }).then(r => r.data.data),

  // Legacy compat
  activar: (empresaId: number, plan: string, meses: number, notas?: string) =>
    api.patch(`/suscripciones/admin/${empresaId}/activar`, { plan, meses, notas }).then(r => r.data.data),
  suspender: (empresaId: number) =>
    api.patch(`/suscripciones/admin/${empresaId}/suspender`).then(r => r.data.data),
};
