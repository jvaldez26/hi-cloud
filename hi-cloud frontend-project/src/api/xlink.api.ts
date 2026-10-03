import api from './client';
import type { ApiResponse, PaginatedData } from '../types';

export type XlinkTipoDocumento = 'factura_credito' | 'nota_credito' | 'orden_compra';
export type XlinkEstadoReceptor = 'pendiente' | 'procesado' | 'procesado_manual' | 'descartado' | 'anulado_en_origen';

export interface XlinkRelacion {
  estado: 'vinculado' | 'coincide_sin_vincular' | 'no_existe';
  id?: number;
  nombre?: string;
}

export interface XlinkDirectorioFila {
  xlinkId: string;
  nombreComercial: string;
  rnc: string | null;
  industria: string | null;
  proveedorRelacionado: XlinkRelacion;
  clienteRelacionado: XlinkRelacion;
}

export interface XlinkDocumentoFila {
  id: number;
  origenEmpresaId?: number;
  destinoEmpresaId?: number;
  tipoDocumento: XlinkTipoDocumento;
  numeroOrigen: string;
  ncfOrigen: string | null;
  fechaOrigen: string;
  totalOrigen: number;
  estadoReceptor: XlinkEstadoReceptor;
  documentoGeneradoTipo?: string | null;
  documentoGeneradoId?: number | null;
  numeroGenerado?: string | null;
  publicadoEn: string;
  publicadoPorUsuarioNombre?: string;
  procesadoEn?: string | null;
  motivoDescarte?: string | null;
  /** Nombre y xlinkId de la CONTRAPARTE (nunca su empresaId) — quien envió (en Recibidos) o quien recibió (en Enviados). */
  contraparteNombre: string;
  contraparteXlinkId: string;
}

export interface FaltanteMapeo {
  tipo: 'producto';
  valorExterno: string;
  descripcion: string;
  /** Precio unitario tal como lo facturó la contraparte — sugerido al crear el producto. */
  precioReferencia: number;
  /** Unidad de medida real de la línea — nunca "UND" fijo. */
  unidad: string;
  /** Tasa de ITBIS real de la línea (0/16/18) — nunca 18 fijo. */
  porcentajeIva: number;
}

export interface RecibirXlinkResultadoItem {
  xlinkDocumentoId: number;
  ok: boolean;
  error?: string;
  faltantes?: FaltanteMapeo[];
  yaExistia?: boolean;
  documentoGeneradoId?: number;
  numeroGenerado?: string;
}

export interface PublicarXlinkResultadoItem {
  id: number;
  ok: boolean;
  error?: string;
}

export interface EstadoXlinkItem {
  id: number;
  yaEnviado: boolean;
  estadoReceptor?: XlinkEstadoReceptor;
  numeroGenerado?: string;
  elegible: boolean;
  motivo?: string;
}

const TIPO_DOCUMENTO_LABEL: Record<XlinkTipoDocumento, string> = {
  factura_credito: 'Factura a Crédito',
  nota_credito:    'Nota de Crédito',
  orden_compra:    'Orden de Compra',
};

export function tipoDocumentoLabel(tipo: XlinkTipoDocumento): string {
  return TIPO_DOCUMENTO_LABEL[tipo] ?? tipo;
}

export const xlinkApi = {
  // ── Fase 2 — activar / directorio / vincular ──────────────────────────────
  actualizarVisibilidad: (visible: boolean) =>
    api.patch<ApiResponse<{ xlinkVisible: boolean }>>('/xlink/visibilidad', { visible }).then(r => r.data.data),

  directorio: (filtros: { q?: string; soloRegistradas?: boolean; page?: number } = {}) => {
    const params = new URLSearchParams();
    if (filtros.q)               params.set('q', filtros.q);
    if (filtros.soloRegistradas) params.set('soloRegistradas', 'true');
    if (filtros.page)            params.set('page', String(filtros.page));
    return api.get<ApiResponse<PaginatedData<XlinkDirectorioFila>>>(`/xlink/directorio?${params}`).then(r => r.data.data);
  },

  vincular: (xlinkId: string, rol: 'proveedor' | 'cliente') =>
    api.post<ApiResponse<unknown>>('/xlink/vincular', { xlinkId, rol }).then(r => r.data.data),

  // ── Fase 3 — publicar / enviar ────────────────────────────────────────────
  publicar: (tipoDocumento: XlinkTipoDocumento, documentoIds: number[]) =>
    api.post<ApiResponse<PublicarXlinkResultadoItem[]>>('/xlink/publicar', { tipoDocumento, documentoIds }).then(r => r.data.data),

  /** Estado (ya enviado / elegible / motivo) de varios documentos, en una sola consulta. */
  estado: (tipoDocumento: XlinkTipoDocumento, documentoIds: number[]) =>
    api.post<ApiResponse<EstadoXlinkItem[]>>('/xlink/estado', { tipoDocumento, documentoIds }).then(r => r.data.data),

  eliminarEnviado: (id: number) =>
    api.delete<ApiResponse<unknown>>(`/xlink/enviados/${id}`).then(r => r.data.data),

  listarEnviados: (filtros: { desde?: string; hasta?: string; tipoDocumento?: XlinkTipoDocumento; numeroOrigen?: string; ncfOrigen?: string; estadoReceptor?: XlinkEstadoReceptor; page?: number } = {}) =>
    listarLado('origen', filtros),

  // ── Fase 4 — recibir / homologar ──────────────────────────────────────────
  listarRecibidos: (estadoReceptor: XlinkEstadoReceptor | XlinkEstadoReceptor[], filtros: { desde?: string; hasta?: string; tipoDocumento?: XlinkTipoDocumento; numeroOrigen?: string; ncfOrigen?: string; page?: number } = {}) =>
    listarLado('destino', { ...filtros, estadoReceptor }),

  contarPendientes: () =>
    api.get<ApiResponse<{ total: number }>>('/xlink/pendientes/conteo').then(r => r.data.data),

  recibir: (items: { xlinkDocumentoId: number; tipoGasto606?: string; tipoRetencionIsr?: 'si' | 'no' }[]) =>
    api.post<ApiResponse<RecibirXlinkResultadoItem[]>>('/xlink/recibir', { items }).then(r => r.data.data),

  guardarMapeos: (contraparteXlinkId: string, mapeos: {
    tipo: 'producto'; valorExterno: string;
    valorInternoId?: number;
    crearProducto?: { nombre: string; unidadMedida?: string; porcentajeIva?: number; precio?: number };
  }[]) =>
    api.post<ApiResponse<unknown>>('/xlink/mapeos', { contraparteXlinkId, mapeos }).then(r => r.data.data),

  marcarProcesado: (id: number) =>
    api.patch<ApiResponse<XlinkDocumentoFila>>(`/xlink/${id}/marcar-procesado`, {}).then(r => r.data.data),

  descartar: (id: number, motivo: string) =>
    api.patch<ApiResponse<XlinkDocumentoFila>>(`/xlink/${id}/descartar`, { motivo }).then(r => r.data.data),

  regresarPendiente: (id: number) =>
    api.patch<ApiResponse<XlinkDocumentoFila>>(`/xlink/${id}/regresar-pendiente`, {}).then(r => r.data.data),

  urlPdfOriginal: (id: number) => `/api/v1/xlink/${id}/pdf-original`,

  formulario: (id: number) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/xlink/${id}/formulario`).then(r => r.data.data),
};

function listarLado(
  _lado: 'origen' | 'destino',
  filtros: { desde?: string; hasta?: string; tipoDocumento?: XlinkTipoDocumento; numeroOrigen?: string; ncfOrigen?: string; estadoReceptor?: XlinkEstadoReceptor | XlinkEstadoReceptor[]; page?: number },
) {
  const params = new URLSearchParams({ limit: '10' });
  if (filtros.page)           params.set('page', String(filtros.page));
  if (filtros.desde)          params.set('desde', filtros.desde);
  if (filtros.hasta)          params.set('hasta', filtros.hasta);
  if (filtros.tipoDocumento)  params.set('tipoDocumento', filtros.tipoDocumento);
  if (filtros.numeroOrigen)   params.set('numeroOrigen', filtros.numeroOrigen);
  if (filtros.ncfOrigen)      params.set('ncfOrigen', filtros.ncfOrigen);
  // Repetir la clave (?estadoReceptor=a&estadoReceptor=b) — así es como el
  // parser de query del backend (qs) arma el array; "Procesados" la usa para
  // pedir 'procesado' Y 'procesado_manual' juntos en una sola llamada.
  if (Array.isArray(filtros.estadoReceptor)) {
    for (const e of filtros.estadoReceptor) params.append('estadoReceptor', e);
  } else if (filtros.estadoReceptor) {
    params.set('estadoReceptor', filtros.estadoReceptor);
  }
  const ruta = _lado === 'origen' ? '/xlink/enviados' : '/xlink/recibidos';
  return api.get<ApiResponse<PaginatedData<XlinkDocumentoFila>>>(`${ruta}?${params}`).then(r => r.data.data);
}
