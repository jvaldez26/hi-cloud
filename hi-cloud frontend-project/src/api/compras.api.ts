import api from './client';
import type { ApiResponse, PaginatedData, Compra, CompraEstado } from '../types';

export interface CompraDetallePayload {
  productoId: number; cantidad: number; precioUnitario: number;
  porcentajeItbis?: number; descripcion?: string;
}
export interface CompraPayload {
  proveedorId: number; fecha: string;
  detalles: CompraDetallePayload[];
  notas?: string; numeroFacturaProveedor?: string;
  tipoPago?: 'contado' | 'credito';
  diasCredito?: number;
}

export const comprasApi = {
  list: (p = 1, limit = 10, filters: { search?: string; estado?: string; desde?: string; hasta?: string } = {}) => {
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (filters.search) params.set('search', filters.search);
    if (filters.estado) params.set('estado', filters.estado);
    if (filters.desde)  params.set('desde', filters.desde);
    if (filters.hasta)  params.set('hasta', filters.hasta);
    return api.get<ApiResponse<PaginatedData<Compra>>>(`/compras?${params}`).then(r => r.data.data);
  },

  getOne: (id: number) =>
    api.get<ApiResponse<Compra>>(`/compras/${id}`).then(r => r.data.data),

  create: (body: CompraPayload) =>
    api.post<ApiResponse<Compra>>('/compras', body).then(r => r.data.data),

  cambiarEstado: (id: number, estado: CompraEstado) =>
    api.patch(`/compras/${id}/estado`, { estado }).then(r => r.data),

  remove: (id: number) =>
    api.delete(`/compras/${id}`).then(r => r.data),
};
