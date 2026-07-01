import api from './client';
import type { ApiResponse, PaginatedData, Factura, FacturaEstado } from '../types';

export interface FacturaDetallePayload {
  productoId?: number;
  opticaInventarioId?: number;
  cantidad: number; precioUnitario: number; descripcion?: string;
  porcentajeIva?: number;
}

export interface EmitirPosBody {
  tipoEcf?: number;
  datosComprador?: {
    rnc?: string;
    cedula?: string;
    razonSocial?: string;
    direccion?: string;
    numeroOrdenCompra?: string;
  };
  /** Si true → crear e-CF en CONTINGENCIA sin llamar a MSeller (modo contingencia en Config POS) */
  modoContingencia?: boolean;
}
export interface FacturaPayload {
  clienteId:       number;
  fecha:           string;
  detalles:        FacturaDetallePayload[];
  tipoNcf?:        string;
  rncComprador?:   string;
  notas?:          string;
  vendedorId?:     number;
  nombreVendedor?: string;
  moneda?:         string;
  tipoCambio?:     number;
}

export const facturasApi = {
  list: (p = 1, limit = 10, filters: {
    search?: string; estado?: string; desde?: string; hasta?: string;
    clienteId?: number; tipoPago?: string; tipoNcf?: string;
    montoMin?: number; montoMax?: number;
  } = {}) => {
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (filters.search)    params.set('search',    filters.search);
    if (filters.estado)    params.set('estado',    filters.estado);
    if (filters.desde)     params.set('desde',     filters.desde);
    if (filters.hasta)     params.set('hasta',     filters.hasta);
    if (filters.clienteId) params.set('clienteId', String(filters.clienteId));
    if (filters.tipoPago)  params.set('tipoPago',  filters.tipoPago);
    if (filters.tipoNcf)   params.set('tipoNcf',   filters.tipoNcf);
    if (filters.montoMin != null) params.set('montoMin', String(filters.montoMin));
    if (filters.montoMax != null) params.set('montoMax', String(filters.montoMax));
    return api.get<ApiResponse<PaginatedData<Factura>>>(`/facturas?${params}`).then(r => r.data.data);
  },

  getOne: (id: number) =>
    api.get<ApiResponse<Factura>>(`/facturas/${id}`).then(r => r.data.data),

  create: (body: FacturaPayload) =>
    api.post<ApiResponse<Factura>>('/facturas', body).then(r => r.data.data),

  update: (id: number, body: FacturaPayload & { tipoPago?: string; diasCredito?: number }) =>
    api.patch<ApiResponse<Factura>>(`/facturas/${id}`, body).then(r => r.data.data ?? r.data),

  cambiarEstado: (id: number, estado: FacturaEstado) =>
    api.patch(`/facturas/${id}/estado`, { estado }).then(r => r.data.data ?? r.data),

  /** Emite desde POS con timeout de 8s en el backend — la venta no se bloquea si tu proveedor e-CF falla */
  emitirPos: (id: number, body?: EmitirPosBody) =>
    api.patch(`/facturas/${id}/emitir-pos`, { estado: 'emitida', ...body }).then(r => r.data.data ?? r.data),

  /** Emite e-CF para una factura EMITIDA/PAGADA que no tiene comprobante */
  emitirEcfIndividual: (id: number) =>
    api.post(`/facturas/${id}/emitir-ecf`).then(r => r.data.data ?? r.data),

  /** Emite e-CF para TODAS las facturas sin comprobante (batch — solo ADMIN) */
  recuperarEcfBatch: () =>
    api.post('/facturas/recuperar-ecf').then(r => r.data.data ?? r.data),

  remove: (id: number) =>
    api.delete(`/facturas/${id}`).then(r => r.data),

  resumen: () =>
    api.get('/facturas/resumen').then(r => r.data.data ?? r.data),

  /** Obtiene el e-CF asociado a una factura */
  getEcf: (facturaId: number) =>
    api.get(`/ecf?facturaId=${facturaId}&limit=1`).then(r => {
      const d = r.data?.data ?? r.data;
      return (d?.data ?? d)?.[0] ?? null;
    }),

  /** Reintenta el envío de un e-CF rechazado o en contingencia */
  reenviarEcf: (numero: string) =>
    api.post(`/ecf/${numero}/reenviar`).then(r => r.data.data ?? r.data),

  /** Duplica una factura — crea nueva en borrador con mismo cliente e ítems */
  duplicar: (id: number) =>
    api.post(`/facturas/${id}/duplicar`).then(r => r.data.data ?? r.data),
};
