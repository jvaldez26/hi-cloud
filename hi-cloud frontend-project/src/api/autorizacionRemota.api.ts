import api from './client';

export type EstadoSolicitudRemota = 'pendiente' | 'aprobada' | 'rechazada' | 'expirada' | 'cancelada';

export interface SolicitudAutorizacionRemota {
  id: number;
  empresaId: number;
  cajeroId: number;
  cajeroNombre: string;
  sucursalId: number | null;
  cajaId: number | null;
  clave: string;
  estado: EstadoSolicitudRemota;
  motivo: string;
  detalle: Record<string, unknown> | null;
  facturaId: number | null;
  clienteId: number | null;
  monto: number | null;
  supervisorId: number | null;
  supervisorNombre: string | null;
  comentario: string | null;
  ip: string | null;
  dispositivo: string | null;
  createdAt: string;
  respondidoEn: string | null;
  expiraEn: string;
}

export interface CrearSolicitudAutorizacionRemotaPayload {
  clave: string;
  motivo: string;
  cajaId?: number;
  detalle?: Record<string, unknown>;
  facturaId?: number;
  clienteId?: number;
  monto?: number;
}

export interface EstadoSolicitudAutorizacionRemota {
  id: number;
  estado: EstadoSolicitudRemota;
  comentario: string | null;
  supervisorNombre: string | null;
  token: string | null;
  expiraEn: string;
}

function unwrap<T>(r: any): T { return r.data?.data ?? r.data; }

export const autorizacionRemotaApi = {
  crear: (payload: CrearSolicitudAutorizacionRemotaPayload) =>
    api.post('/autorizacion-remota', payload).then(r => unwrap<SolicitudAutorizacionRemota>(r)),

  estado: (id: number) =>
    api.get(`/autorizacion-remota/${id}/estado`).then(r => unwrap<EstadoSolicitudAutorizacionRemota>(r)),

  cancelar: (id: number) =>
    api.post(`/autorizacion-remota/${id}/cancelar`).then(r => unwrap<{ ok: boolean }>(r)),

  pendientes: () =>
    api.get('/autorizacion-remota/pendientes').then(r => unwrap<SolicitudAutorizacionRemota[]>(r)),

  historial: () =>
    api.get('/autorizacion-remota/historial').then(r => unwrap<SolicitudAutorizacionRemota[]>(r)),

  decidir: (id: number, decision: 'aprobada' | 'rechazada', comentario?: string) =>
    api.post(`/autorizacion-remota/${id}/decidir`, { decision, comentario }).then(r => unwrap<SolicitudAutorizacionRemota>(r)),
};
