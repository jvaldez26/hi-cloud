import api from './client';

export interface PresupuestoPayload {
  anio: number; nombre: string; tipo: string; descripcion?: string;
  lineas?: Array<{ mes: number; categoria?: string; montoPresupuestado: number }>;
}

export const presupuestosApi = {
  dashboard: (anio: number) =>
    api.get(`/presupuestos/dashboard?anio=${anio}`).then(r => r.data.data),

  comparativa: (anio: number) =>
    api.get(`/presupuestos/comparativa-anual?anio=${anio}`).then(r => r.data.data),

  list: (p = 1, limit = 10, anio?: number, tipo?: string) =>
    api.get(`/presupuestos?page=${p}&limit=${limit}${anio ? `&anio=${anio}` : ''}${tipo ? `&tipo=${tipo}` : ''}`)
       .then(r => r.data.data),

  create: (body: PresupuestoPayload) =>
    api.post('/presupuestos', body).then(r => r.data.data),

  findById: (id: number) =>
    api.get(`/presupuestos/${id}`).then(r => r.data.data),

  variacion: (id: number) =>
    api.get(`/presupuestos/${id}/variacion`).then(r => r.data.data),

  addLinea: (id: number, body: { mes: number; montoPresupuestado: number; categoria?: string }) =>
    api.post(`/presupuestos/${id}/lineas`, body).then(r => r.data.data),

  aprobar: (id: number) =>
    api.patch(`/presupuestos/${id}/aprobar`).then(r => r.data.data),

  cerrar: (id: number) =>
    api.patch(`/presupuestos/${id}/cerrar`).then(r => r.data.data),
};
