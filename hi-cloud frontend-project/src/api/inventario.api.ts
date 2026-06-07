import api from './client';
import type { ApiResponse, PaginatedData, MovimientoInventario } from '../types';

export interface LotePayload {
  productoId: number;
  numeroLote: string;
  cantidad: number;
  fechaVencimiento?: string;
  fechaFabricacion?: string;
  costoUnitario?: number;
  almacenId?: number;
  proveedor?: string;
  referencia?: string;
  notas?: string;
}

export interface SerialesPayload {
  productoId: number;
  numeros: string[];
  loteId?: number;
  costoUnitario?: number;
  fechaVencimientoGarantia?: string;
  notas?: string;
}

export const inventarioApi = {
  // ── Movimientos ───────────────────────────────────────────────────────────
  movimientos: (p = 1, limit = 15, filters: { search?: string; tipo?: string; desde?: string; hasta?: string } = {}) => {
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (filters.search) params.set('search', filters.search);
    if (filters.tipo)   params.set('tipo', filters.tipo);
    if (filters.desde)  params.set('desde', filters.desde);
    if (filters.hasta)  params.set('hasta', filters.hasta);
    return api.get<ApiResponse<PaginatedData<MovimientoInventario>>>(`/inventario/movimientos?${params}`).then(r => r.data.data);
  },

  stockBajo: () =>
    api.get('/inventario/stock-bajo').then(r => r.data.data),

  entrada: (productoId: number, cantidad: number, motivo?: string) =>
    api.post('/inventario/entrada', { productoId, cantidad, motivo }).then(r => r.data),

  salida: (productoId: number, cantidad: number, motivo?: string) =>
    api.post('/inventario/salida', { productoId, cantidad, motivo }).then(r => r.data),

  // ── Lotes ─────────────────────────────────────────────────────────────────
  lotes: (productoId?: number, estado?: string, soloVigentes = false) => {
    const params = new URLSearchParams();
    if (productoId)   params.set('productoId',   String(productoId));
    if (estado)       params.set('estado',        estado);
    if (soloVigentes) params.set('soloVigentes',  'true');
    return api.get(`/inventario/lotes?${params}`).then(r => r.data.data);
  },

  alertasLotes: () =>
    api.get('/inventario/lotes/alertas').then(r => r.data.data),

  crearLote: (body: LotePayload) =>
    api.post('/inventario/lotes', body).then(r => r.data.data),

  updateLote: (id: number, body: { estado?: string; cantidadDisponible?: number; notas?: string }) =>
    api.patch(`/inventario/lotes/${id}`, body).then(r => r.data.data),

  // ── Seriales ──────────────────────────────────────────────────────────────
  seriales: (productoId?: number, estado?: string, search?: string) => {
    const params = new URLSearchParams();
    if (productoId) params.set('productoId', String(productoId));
    if (estado)     params.set('estado',     estado);
    if (search)     params.set('search',     search);
    return api.get(`/inventario/seriales?${params}`).then(r => r.data.data);
  },

  resumenSeriales: (productoId?: number) => {
    const params = productoId ? `?productoId=${productoId}` : '';
    return api.get(`/inventario/seriales/resumen${params}`).then(r => r.data.data);
  },

  buscarSerial: (numero: string) =>
    api.get(`/inventario/seriales/buscar/${encodeURIComponent(numero)}`).then(r => r.data.data),

  registrarSeriales: (body: SerialesPayload) =>
    api.post('/inventario/seriales', body).then(r => r.data.data),

  actualizarEstadoSerial: (id: number, body: { estado: string; facturaId?: number; clienteId?: number; fechaVenta?: string; notas?: string }) =>
    api.patch(`/inventario/seriales/${id}/estado`, body).then(r => r.data.data),

  // ── Solicitudes de Ajuste ───────────────────────────────────────────────────
  createSolicitudAjuste: (body: { productoId: number; cantidadNueva: number; motivo: string }) =>
    api.post('/inventario/solicitudes-ajuste', body).then(r => r.data.data),

  getSolicitudesAjuste: (estado?: string) => {
    const params = estado ? `?estado=${estado}` : '';
    return api.get(`/inventario/solicitudes-ajuste${params}`).then(r => r.data.data);
  },

  aprobarSolicitudAjuste: (id: number) =>
    api.patch(`/inventario/solicitudes-ajuste/${id}/aprobar`).then(r => r.data.data),

  rechazarSolicitudAjuste: (id: number, motivoRechazo: string) =>
    api.patch(`/inventario/solicitudes-ajuste/${id}/rechazar`, { motivoRechazo }).then(r => r.data.data),
};
