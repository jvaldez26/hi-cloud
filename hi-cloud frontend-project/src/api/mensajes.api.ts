// El backend tiene un ResponseInterceptor global que envuelve TODAS las respuestas:
//   { success: true, data: T, timestamp: string }
//
// Por eso cada función extrae r.data.data (el payload real) en lugar de r.data.
// Sin esto, el componente recibe el objeto wrapper y .filter/.map fallan en runtime.

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
  destinatario:       'todas' | 'lista' | 'plan';
  destinatarioIds:    number[] | null;
  destinatarioPlan:   string | null;
  fechaExpiracion:    string | null;
  activo:             boolean;
  createdBy:          number;
  autorNombre:        string;
  totalLeidos:        number;
  totalInteracciones: number;
  createdAt:          string;
  updatedAt:          string;
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

/** Extrae la lista del wrapper { success, data: T[], timestamp } del backend */
function unwrapList<T>(r: any): T[] {
  const d = r?.data?.data;
  return Array.isArray(d) ? d : [];
}

/** Extrae el objeto del wrapper { success, data: T, timestamp } del backend */
function unwrap<T>(r: any): T {
  return r?.data?.data;
}

export const mensajesApi = {
  // ─── Cliente ─────────────────────────────────────────────

  /**
   * Lista de mensajes de la bandeja.
   * El backend devuelve { success, data: MensajeBandeja[], timestamp }.
   * unwrapList extrae el array; Array.isArray garantiza que nunca llegue
   * un objeto al componente (evita "s.filter is not a function").
   */
  getBandeja: (tab: 'principal' | 'novedades' | 'archivo' = 'principal') =>
    api.get('/mensajes/bandeja', { params: { tab } }).then(r => unwrapList<MensajeBandeja>(r)),

  /**
   * Conteo de mensajes no leídos para el badge del menú.
   * El backend devuelve { success, data: { count: N }, timestamp }.
   */
  getNoLeidosCount: () =>
    api.get('/mensajes/no-leidos-count').then(r => (unwrap<{ count: number }>(r)?.count ?? 0)),

  /**
   * IDs de novedades cuyo toast aún no se ha mostrado.
   * El backend devuelve { success, data: { ids: string[] }, timestamp }.
   */
  getNovedadesNoVistas: () =>
    api.get('/mensajes/novedades-no-vistas').then(r => {
      const ids = unwrap<{ ids: string[] }>(r)?.ids;
      return Array.isArray(ids) ? ids : [];
    }),

  // Mutaciones — 204 No Content, sin body que extraer
  marcarLeido: (id: string) =>
    api.patch(`/mensajes/${id}/leer`),

  marcarVisto: (id: string) =>
    api.post(`/mensajes/${id}/visto`),

  archivar: (id: string) =>
    api.patch(`/mensajes/${id}/archivar`),

  marcarTodosLeidos: (tab: 'principal' | 'novedades') =>
    api.patch('/mensajes/leer-todos', null, { params: { tab } }),

  desarchivar: (id: string) =>
    api.patch(`/mensajes/${id}/desarchivar`),

  eliminar: (id: string) =>
    api.patch(`/mensajes/${id}/eliminar`),

  eliminarBulk: (ids: string[]) =>
    api.post('/mensajes/eliminar-bulk', { ids }),

  desarchivarBulk: (ids: string[]) =>
    api.post('/mensajes/desarchivar-bulk', { ids }),

  // ─── Admin ───────────────────────────────────────────────

  adminListar: () =>
    api.get('/mensajes/admin').then(r => unwrapList<MensajeAdmin>(r)),

  adminCrear: (payload: CreateMensajePayload) =>
    api.post('/mensajes/admin', payload).then(r => unwrap<{ id: string }>(r)),

  adminEditar: (id: string, payload: Partial<CreateMensajePayload> & { activo?: boolean }) =>
    api.patch(`/mensajes/admin/${id}`, payload),

  adminDesactivar: (id: string) =>
    api.delete(`/mensajes/admin/${id}`),

  adminStats: (id: string) =>
    api.get(`/mensajes/admin/${id}/stats`).then(r =>
      unwrap<{ totalLeidos: number; totalVistos: number; totalArchivados: number; totalInteracciones: number }>(r),
    ),
};
