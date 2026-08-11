import api from './client';
import type { ApiResponse, PaginatedData, Cliente } from '../types';

export interface ClientePayload {
  nombre: string; razonSocial?: string; rfc: string; rncReceptor?: string;
  email?: string; telefono?: string; direccion?: string;
  ciudad?: string; regimenFiscal?: string;
  sector?: string; diasCredito?: number; limiteCredito?: number; notas?: string;
}

/** Clientes que ya usan un RNC. Compartirlo es válido (escuelas de un distrito). */
export interface ClientesConMismoRnc {
  rnc:      string;
  total:    number;
  clientes: Array<Pick<Cliente,
    'id' | 'nombre' | 'razonSocial' | 'rfc' | 'rncReceptor' |
    'direccion' | 'ciudad' | 'telefono' | 'email'
  >>;
}

export const clientesApi = {
  list:   (p = 1, limit = 10, search = '') =>
    api.get<ApiResponse<PaginatedData<Cliente>>>(`/clientes?page=${p}&limit=${limit}&search=${search}`)
       .then(r => r.data.data),

  getOne: (id: number) =>
    api.get<ApiResponse<Cliente>>(`/clientes/${id}`).then(r => r.data.data),

  /** Clientes activos que ya usan este RNC (para la alerta no bloqueante) */
  buscarPorRnc: (rnc: string, excluirId?: number) =>
    api.get<ApiResponse<ClientesConMismoRnc>>(
      `/clientes/rnc/${encodeURIComponent(rnc)}${excluirId ? `?excluirId=${excluirId}` : ''}`,
    ).then(r => r.data.data),

  create: (body: ClientePayload) =>
    api.post<ApiResponse<Cliente>>('/clientes', body).then(r => r.data.data),

  update: (id: number, body: Partial<ClientePayload>) =>
    api.patch<ApiResponse<Cliente>>(`/clientes/${id}`, body).then(r => r.data.data),

  remove: (id: number) =>
    api.delete(`/clientes/${id}`).then(r => r.data),
};
