import api from './client';

export interface MensajeBandeja {
  id:               string;
  titulo:           string;
  cuerpo:           string;
  tipo:             'aviso' | 'novedad';
  fechaPublicacion: string;
  editadoEn:        string | null;
  leidoEn:          string | null;
  vistoEn:          string | null;
  archivadoEn:      string | null;
}

export interface MensajeAdmin extends MensajeBandeja {
  destinatario:      'todas' | 'lista' | 'plan';
  destinatarioIds:   number[] | null;
  destinatarioPlan:  string | null;
  fechaExpiracion:   string | null;
  activo:            boolean;
  createdBy:         number;
  autorNombre:       string;
  totalLeidos:       number;
  totalInteracciones: number;
  createdAt:         string;
  updatedAt:         string;
}

export interface CreateMensajePayload {
  titulo:            string;
  cuerpo:            string;
  tipo:              'aviso' | 'novedad';
  destinatario:      'todas' | 'lista' | 'plan';
  destinatarioIds?:  number[];
  destinatarioPlan?: string;
  fechaPublicacion:  string;
  fechaExpiracion?:  string;
  activo?:           boolean;
}

export const mensajesApi = {
  // ─── Cliente ─────────────────────────────────────────────

  getBandeja: (tab: 'principal' | 'novedades' | 'archivo' = 'principal') =>
    api.get<MensajeBandeja[]>('/mensajes/bandeja', { params: { tab } }).then(r => r.data),

  getNoLeidosCount: () =>
    api.get<{ count: number }>('/mensajes/no-leidos-count').then(r => r.data.count),

  getNovedadesNoVistas: () =>
    api.get<{ ids: string[] }>('/mensajes/novedades-no-vistas').then(r => r.data.ids),

  marcarLeido: (id: string) =>
    api.patch(`/mensajes/${id}/leer`),

  marcarVisto: (id: string) =>
    api.post(`/mensajes/${id}/visto`),

  archivar: (id: string) =>
    api.patch(`/mensajes/${id}/archivar`),

  marcarTodosLeidos: (tab: 'principal' | 'novedades') =>
    api.patch('/mensajes/leer-todos', null, { params: { tab } }),

  // ─── Admin ───────────────────────────────────────────────

  adminListar: () =>
    api.get<MensajeAdmin[]>('/mensajes/admin').then(r => r.data),

  adminCrear: (payload: CreateMensajePayload) =>
    api.post<{ id: string }>('/mensajes/admin', payload).then(r => r.data),

  adminEditar: (id: string, payload: Partial<CreateMensajePayload> & { activo?: boolean }) =>
    api.patch(`/mensajes/admin/${id}`, payload),

  adminDesactivar: (id: string) =>
    api.delete(`/mensajes/admin/${id}`),

  adminStats: (id: string) =>
    api.get<{ totalLeidos: number; totalVistos: number; totalArchivados: number; totalInteracciones: number }>(
      `/mensajes/admin/${id}/stats`,
    ).then(r => r.data),
};
