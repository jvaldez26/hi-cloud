import api from './client';
import type { ApiResponse, PaginatedData, Cliente } from '../types';

export interface ClientePayload {
  nombre: string; rfc: string; rncReceptor?: string;
  email?: string; telefono?: string; direccion?: string;
  ciudad?: string; regimenFiscal?: string;
  sector?: string; diasCredito?: number; limiteCredito?: number; notas?: string;
}

export const clientesApi = {
  list:   (p = 1, limit = 10, search = '') =>
    api.get<ApiResponse<PaginatedData<Cliente>>>(`/clientes?page=${p}&limit=${limit}&search=${search}`)
       .then(r => r.data.data),

  getOne: (id: number) =>
    api.get<ApiResponse<Cliente>>(`/clientes/${id}`).then(r => r.data.data),

  create: (body: ClientePayload) =>
    api.post<ApiResponse<Cliente>>('/clientes', body).then(r => r.data.data),

  update: (id: number, body: Partial<ClientePayload>) =>
    api.patch<ApiResponse<Cliente>>(`/clientes/${id}`, body).then(r => r.data.data),

  remove: (id: number) =>
    api.delete(`/clientes/${id}`).then(r => r.data),
};
