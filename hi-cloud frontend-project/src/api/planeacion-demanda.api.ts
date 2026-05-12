import api from './client';

export const planeacionApi = {
  generar: (body: { horizonteMeses?: number; notas?: string; soloConVentas?: boolean }) =>
    api.post('/planeacion-demanda/generar', body).then(r => r.data.data),

  listar: (page = 1) =>
    api.get(`/planeacion-demanda?page=${page}`).then(r => r.data.data),

  findOne: (id: number) =>
    api.get(`/planeacion-demanda/${id}`).then(r => r.data.data),

  getLineas: (id: number, soloAlertas = false) =>
    api.get(`/planeacion-demanda/${id}/lineas?soloAlertas=${soloAlertas}`).then(r => r.data.data),

  aprobar: (id: number) =>
    api.patch(`/planeacion-demanda/${id}/aprobar`, {}).then(r => r.data.data),

  sugerencias: (planId?: number) => {
    const q = planId ? `?planId=${planId}` : '';
    return api.get(`/planeacion-demanda/sugerencias${q}`).then(r => r.data.data);
  },

  analizarProducto: (productoId: number) =>
    api.get(`/planeacion-demanda/analizar/${productoId}`).then(r => r.data.data),
};
