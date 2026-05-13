import api from './client';

export const retencionesApi = {
  listar: (page = 1, limit = 20) =>
    api.get(`/retenciones?page=${page}&limit=${limit}`).then(r => r.data.data),
  crear: (body: any) =>
    api.post('/retenciones', body).then(r => r.data.data),
  eliminar: (id: number) =>
    api.delete(`/retenciones/${id}`).then(r => r.data),
  ir17: (mes: number, anio: number) =>
    api.get(`/retenciones/reporte/ir17?mes=${mes}&anio=${anio}`).then(r => r.data.data),
  descargarPdf: (id: number) =>
    window.open(`/api/v1/retenciones/${id}/pdf`, '_blank'),
};
