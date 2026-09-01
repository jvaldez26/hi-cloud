import api from './client';
import type { ApiResponse } from '../types';

/** De dónde salió el mínimo con el que se calcula el faltante. */
export type OrigenMinimo = 'almacen' | 'producto' | 'sin-configurar';

export interface LineaReposicion {
  vinculoId:        number;
  productoId:       number;
  codigo:           string;
  nombre:           string;
  unidadMedida:     string;
  codigoProveedor:  string | null;
  esPreferente:     boolean;
  existencia:       number;
  minimo:           number;
  origenMinimo:     OrigenMinimo;
  faltante:         number;
  cantidadSugerida: number;
  origenSugerencia: 'plan' | 'faltante';
  precioPactado:    number | null;
  monedaPactada:    string;
  precioPactadoAt:  string | null;
  /** true mientras el precio venga del historial y no lo haya confirmado nadie. */
  precioEsEstimado: boolean;
  diasEntrega:      number | null;
  pedidoMinimo:     number | null;
  multiploEmpaque:  number | null;
}

export interface RespuestaReposicion {
  almacenId: number;
  lineas:    LineaReposicion[];
}

export interface VincularPayload {
  proveedorId:      number;
  productoIds:      number[];
  codigoProveedor?: string;
  precioPactado?:   number;
  monedaPactada?:   string;
  diasEntrega?:     number;
  pedidoMinimo?:    number;
  multiploEmpaque?: number;
  notas?:           string;
}

export const productoProveedorApi = {
  /**
   * El almacén va explícito. Si no se pasa, el backend usa el del JWT y, si
   * tampoco lo hay, responde 400 con codigo ALMACEN_REQUERIDO — nunca cae al
   * stock global, porque ese número no es el que el proveedor necesita ver.
   */
  reposicion: (proveedorId: number, almacenId?: number) =>
    api.get<ApiResponse<RespuestaReposicion>>(
      `/producto-proveedor/proveedor/${proveedorId}/reposicion`,
      { params: almacenId ? { almacenId } : undefined },
    ).then(r => r.data.data),

  porProducto: (productoId: number) =>
    api.get<ApiResponse<any[]>>(`/producto-proveedor/producto/${productoId}`).then(r => r.data.data),

  vincular: (body: VincularPayload) =>
    api.post<ApiResponse<{ creados: number; yaExistian: number }>>(
      '/producto-proveedor/vincular', body,
    ).then(r => r.data.data),

  actualizar: (id: number, body: Record<string, unknown>) =>
    api.patch<ApiResponse<any>>(`/producto-proveedor/${id}`, body).then(r => r.data.data),

  marcarPreferente: (id: number) =>
    api.patch(`/producto-proveedor/${id}/preferente`).then(r => r.data),

  desvincular: (id: number) =>
    api.delete(`/producto-proveedor/${id}`).then(r => r.data),
};
