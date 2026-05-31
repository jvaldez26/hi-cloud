import api from './client';
import type { ApiResponse, PaginatedData, CuentaPorPagar, MetodoPago } from '../types';

export const cxpApi = {
  list: (p = 1, limit = 10, filters: { estado?: string; fechaDesde?: string; fechaHasta?: string } | string = {}) => {
    const f = typeof filters === 'string' ? { estado: filters } : filters;
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (f.estado)     params.set('estado', f.estado);
    if (f.fechaDesde) params.set('fechaDesde', f.fechaDesde);
    if (f.fechaHasta) params.set('fechaHasta', f.fechaHasta);
    return api.get<ApiResponse<PaginatedData<CuentaPorPagar>>>(`/cxp?${params}`).then(r => r.data.data);
  },

  vencidas: () =>
    api.get<ApiResponse<CuentaPorPagar[]>>('/cxp/vencidas').then(r => r.data.data),

  resumen: () =>
    api.get('/cxp/resumen').then(r => r.data.data),

  registrarPago: (id: number, monto: number, metodoPago: MetodoPago, referencia?: string, fechaPago?: string, tipoCambio?: number) =>
    api.post(`/cxp/${id}/pago`, { monto, metodoPago, referencia, fechaPago, tipoCambio }).then(r => r.data),
};
