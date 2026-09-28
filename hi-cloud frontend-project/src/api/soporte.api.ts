import api from './client';
import type { ApiResponse, PaginatedData } from '../types';

export type AsuntoSoporte =
  | 'error_tecnico' | 'duda_uso' | 'solicitud_funcion'
  | 'facturacion' | 'certificacion_dgii' | 'otro';

export type EstadoTicketSoporte = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado';
export type PrioridadTicketSoporte = 'baja' | 'media' | 'alta';

export interface ContextoAutomaticoTicket {
  empresaId?: number | null;
  sucursalId?: number | null;
  rol?: string | null;
  usuarioNombre?: string | null;
  usuarioEmail?: string | null;
  url?: string | null;
  modulo?: string | null;
  navegador?: string | null;
  buildId?: string | null;
}

export interface SoporteTicketAdjunto {
  id: number;
  tipoMime: string;
  tamanioBytes: number;
  /** URL firmada, TTL ~15 min — si expira mientras se ve el panel, recargar el ticket la renueva. */
  url: string | null;
}

export interface SoporteTicket {
  id: number;
  empresaId: number | null;
  usuarioId: number;
  asunto: AsuntoSoporte;
  mensaje: string;
  estado: EstadoTicketSoporte;
  prioridad: PrioridadTicketSoporte | null;
  contextoAutomatico: ContextoAutomaticoTicket;
  respuestaAdmin: string | null;
  respondidoPor: number | null;
  respondidoEn: string | null;
  createdAt: string;
  adjuntos?: SoporteTicketAdjunto[];
}

export const MAX_ADJUNTOS_POR_TICKET = 5;
export const MAX_BYTES_POR_ADJUNTO   = 5 * 1024 * 1024;
export const TIPOS_ADJUNTO_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const ASUNTO_SOPORTE_OPTIONS: { value: AsuntoSoporte; label: string }[] = [
  { value: 'error_tecnico',      label: 'Error técnico' },
  { value: 'duda_uso',           label: 'Duda de uso' },
  { value: 'solicitud_funcion',  label: 'Solicitud de función' },
  { value: 'facturacion',        label: 'Facturación' },
  { value: 'certificacion_dgii', label: 'Certificación DGII (CerteCF)' },
  { value: 'otro',               label: 'Otro' },
];

export const soporteApi = {
  /**
   * multipart/form-data siempre (haya o no adjuntos) — más simple que dos
   * caminos distintos, y api/client.ts ya sabe dejar que el navegador ponga
   * el boundary del Content-Type cuando el body es FormData (ver el
   * interceptor de request ahí, con el incidente que documenta).
   */
  crear: (body: {
    asunto: AsuntoSoporte; mensaje: string;
    url?: string; modulo?: string; navegador?: string; buildId?: string;
    adjuntos?: File[];
  }) => {
    const fd = new FormData();
    fd.append('asunto', body.asunto);
    fd.append('mensaje', body.mensaje);
    if (body.url)       fd.append('url', body.url);
    if (body.modulo)    fd.append('modulo', body.modulo);
    if (body.navegador) fd.append('navegador', body.navegador);
    if (body.buildId)   fd.append('buildId', body.buildId);
    for (const archivo of body.adjuntos ?? []) fd.append('adjuntos', archivo);

    return api.post<ApiResponse<SoporteTicket>>('/soporte/tickets', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data);
  },

  misTickets: (p = 1, limit = 10) =>
    api.get<ApiResponse<PaginatedData<SoporteTicket>>>(`/soporte/tickets/mis-tickets?page=${p}&limit=${limit}`)
      .then(r => r.data.data),

  urlAdjunto: (ticketId: number, adjuntoId: number) =>
    api.get<ApiResponse<{ url: string | null }>>(`/soporte/tickets/${ticketId}/adjuntos/${adjuntoId}/url`)
      .then(r => r.data.data),

  // ── Panel de Super Admin ──────────────────────────────────────────────────
  listarAdmin: (p = 1, limit = 10, filtros: {
    estado?: EstadoTicketSoporte; prioridad?: PrioridadTicketSoporte;
    empresaId?: number; desde?: string; hasta?: string;
  } = {}) => {
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (filtros.estado)    params.set('estado', filtros.estado);
    if (filtros.prioridad) params.set('prioridad', filtros.prioridad);
    if (filtros.empresaId) params.set('empresaId', String(filtros.empresaId));
    if (filtros.desde)     params.set('desde', filtros.desde);
    if (filtros.hasta)     params.set('hasta', filtros.hasta);
    return api.get<ApiResponse<PaginatedData<SoporteTicket>>>(`/super-admin/soporte-tickets?${params}`)
      .then(r => r.data.data);
  },

  detalleAdmin: (id: number) =>
    api.get<ApiResponse<SoporteTicket>>(`/super-admin/soporte-tickets/${id}`).then(r => r.data.data),

  responder: (id: number, respuestaAdmin: string) =>
    api.patch<ApiResponse<SoporteTicket>>(`/super-admin/soporte-tickets/${id}/responder`, { respuestaAdmin }).then(r => r.data.data),

  cambiarEstado: (id: number, estado: EstadoTicketSoporte) =>
    api.patch<ApiResponse<SoporteTicket>>(`/super-admin/soporte-tickets/${id}/estado`, { estado }).then(r => r.data.data),

  cambiarPrioridad: (id: number, prioridad: PrioridadTicketSoporte) =>
    api.patch<ApiResponse<SoporteTicket>>(`/super-admin/soporte-tickets/${id}/prioridad`, { prioridad }).then(r => r.data.data),
};
