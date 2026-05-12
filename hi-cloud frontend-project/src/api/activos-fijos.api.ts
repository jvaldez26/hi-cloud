import api from './client';

export interface ActivoPayload {
  codigo: string; descripcion: string;
  categoriaId: number; fechaAdquisicion: string;
  costoAdquisicion: number; valorResidual?: number;
  vidaUtilAnios?: number; ubicacion?: string;
  proveedor?: string; numeroSerie?: string; notas?: string;
}

export const activosFijosApi = {
  categorias: () =>
    api.get('/activos-fijos/categorias').then(r => r.data.data),

  activos: (p = 1, limit = 10, search = '', estado?: string) =>
    api.get(`/activos-fijos?page=${p}&limit=${limit}&search=${search}${estado ? `&estado=${estado}` : ''}`)
       .then(r => r.data.data),

  resumen: () =>
    api.get('/activos-fijos/resumen').then(r => r.data.data),

  createActivo: (body: ActivoPayload) =>
    api.post('/activos-fijos', body).then(r => r.data.data),

  updateActivo: (id: number, body: Partial<ActivoPayload>) =>
    api.patch(`/activos-fijos/${id}`, body).then(r => r.data.data),

  darDeBaja: (id: number, body: { fecha: string; motivo: string; valorVenta?: number }) =>
    api.patch(`/activos-fijos/${id}/dar-de-baja`, body).then(r => r.data.data),

  historial: (id: number) =>
    api.get(`/activos-fijos/${id}/historial`).then(r => r.data.data),

  depreciaciones: (p = 1, limit = 20) =>
    api.get(`/activos-fijos/depreciacion/registros?page=${p}&limit=${limit}`).then(r => r.data.data),

  procesarDepreciacion: (periodo: string) =>
    api.post('/activos-fijos/depreciacion/procesar', { periodo }).then(r => r.data.data),

  reporteDGII: (anio: number) =>
    api.get(`/activos-fijos/reporte-dgii/${anio}`).then(r => r.data.data),
};
