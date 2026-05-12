import api from './client';

export interface LineaSolicitudPayload {
  descripcion: string;
  cantidad: number;
  unidad?: string;
  productoId?: number;
  presupuestoUnitario?: number;
  especificaciones?: string;
}

export interface CreateSolicitudPayload {
  justificacion: string;
  fechaNecesidad?: string;
  prioridad?: 'baja' | 'media' | 'alta' | 'urgente';
  departamento?: string;
  presupuestoEstimado?: number;
  lineas: LineaSolicitudPayload[];
}

export interface LineaCotizacionPayload {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeItbis?: number;
  unidad?: string;
  productoId?: number;
}

export interface CreateCotizacionPayload {
  solicitudId?: number;
  proveedorId: number;
  fechaEnvio?: string;
  fechaValidez?: string;
  tiempoEntregaDias?: number;
  condicionesPago?: string;
  notas?: string;
  lineas: LineaCotizacionPayload[];
}

export const solicitudesCompraApi = {
  // ── Solicitudes ───────────────────────────────────────────────────────────
  listar: (params: { page?: number; estado?: string; prioridad?: string; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.page)      q.set('page',      String(params.page));
    if (params.estado)    q.set('estado',    params.estado);
    if (params.prioridad) q.set('prioridad', params.prioridad);
    if (params.search)    q.set('search',    params.search);
    return api.get(`/solicitudes-compra?${q}`).then(r => r.data.data);
  },

  resumen: () =>
    api.get('/solicitudes-compra/resumen').then(r => r.data.data),

  crear: (body: CreateSolicitudPayload) =>
    api.post('/solicitudes-compra', body).then(r => r.data.data),

  findOne: (id: number) =>
    api.get(`/solicitudes-compra/${id}`).then(r => r.data.data),

  cambiarEstado: (id: number, estado: string, comentario?: string) =>
    api.patch(`/solicitudes-compra/${id}/estado`, { estado, comentario }).then(r => r.data.data),

  // ── Cotizaciones (RFQ) ────────────────────────────────────────────────────
  listarCotizaciones: (params: { solicitudId?: number; estado?: string; page?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.solicitudId) q.set('solicitudId', String(params.solicitudId));
    if (params.estado)      q.set('estado',      params.estado);
    if (params.page)        q.set('page',        String(params.page));
    return api.get(`/solicitudes-compra/cotizaciones/lista?${q}`).then(r => r.data.data);
  },

  crearCotizacion: (body: CreateCotizacionPayload) =>
    api.post('/solicitudes-compra/cotizaciones', body).then(r => r.data.data),

  findCotizacion: (id: number) =>
    api.get(`/solicitudes-compra/cotizaciones/${id}`).then(r => r.data.data),

  registrarRespuesta: (id: number, body: { lineas: LineaCotizacionPayload[]; fechaRespuesta?: string; tiempoEntregaDias?: number; condicionesPago?: string; notas?: string }) =>
    api.patch(`/solicitudes-compra/cotizaciones/${id}/respuesta`, body).then(r => r.data.data),

  seleccionar: (id: number) =>
    api.patch(`/solicitudes-compra/cotizaciones/${id}/seleccionar`, {}).then(r => r.data.data),

  // ── Comparativo ───────────────────────────────────────────────────────────
  comparativo: (solicitudId: number) =>
    api.get(`/solicitudes-compra/${solicitudId}/comparativo`).then(r => r.data.data),
};
