import api from './client';

export interface DocAprobacion {
  id:     number;
  ref:    string;
  monto:  number;
  extra:  string;   // nombre cliente / proveedor / descripción
  estado?: string;
}

export interface SolicitarDto {
  tipo:                 string;
  entidadId:            number;
  entidadRef?:          string;
  monto?:               number;
  comentarioSolicitud?: string;
}

export const aprobacionesApi = {
  resumen: () =>
    api.get('/aprobaciones/resumen').then(r => r.data?.data ?? r.data),

  list: (estado?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (estado) params.set('estado', estado);
    return api.get(`/aprobaciones?${params}`).then(r => {
      console.log('[aprobaciones.list] r.data:', r.data);
      console.log('[aprobaciones.list] r.data?.data:', r.data?.data);
      const result = r.data?.data ?? r.data;
      console.log('[aprobaciones.list] result devuelto:', result);
      return result;
    });
  },

  solicitar: (dto: SolicitarDto) =>
    api.post('/aprobaciones', dto).then(r => r.data?.data ?? r.data),

  aprobar: (id: number, comentario?: string) =>
    api.patch(`/aprobaciones/${id}/aprobar`, { comentario }).then(r => r.data?.data ?? r.data),

  rechazar: (id: number, comentario: string) =>
    api.patch(`/aprobaciones/${id}/rechazar`, { comentario }).then(r => r.data?.data ?? r.data),

  getEstado: (tipo: string, entidadId: number) =>
    api.get(`/aprobaciones/estado/${tipo}/${entidadId}`).then(r => r.data?.data ?? r.data),

  /** Busca documentos reales del tenant para autocompletado en el modal */
  buscarDocumento: (tipo: string, q: string): Promise<DocAprobacion[]> =>
    api
      .get(`/aprobaciones/buscar-documento?tipo=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}`)
      .then(r => r.data?.data ?? r.data ?? []),
};
