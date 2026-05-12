import api from './client';

export const suscripcionesApi = {
  miPlan:    () => api.get('/suscripciones/mi-plan').then(r => r.data.data),
  misLimites:() => api.get('/suscripciones/mis-limites').then(r => r.data.data),
  planes:    () => api.get('/suscripciones/planes').then(r => r.data.data),

  listarTodas: () => api.get('/suscripciones').then(r => r.data.data),
  estadisticas:() => api.get('/suscripciones/estadisticas').then(r => r.data.data),

  activar: (empresaId: number, plan: string, meses: number, notas?: string) =>
    api.post(`/suscripciones/${empresaId}/activar`, { plan, meses, notas }).then(r => r.data.data),

  suspender: (empresaId: number) =>
    api.patch(`/suscripciones/${empresaId}/suspender`).then(r => r.data.data),
};
