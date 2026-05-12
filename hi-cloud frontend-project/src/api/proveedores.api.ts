import api from './client';
import type { ApiResponse, PaginatedData, Proveedor } from '../types';

export interface ProveedorPayload {
  nombre: string; rnc: string;
  telefono?: string; email?: string;
  direccion?: string; contacto?: string;
  categoria?: string; diasPago?: number;
  banco?: string; cuentaBancaria?: string; notas?: string;
}

export const proveedoresApi = {
  list: (p = 1, limit = 10, search = '') =>
    api.get<ApiResponse<PaginatedData<Proveedor>>>(`/proveedores?page=${p}&limit=${limit}&search=${search}`)
       .then(r => r.data.data),

  getOne: (id: number) =>
    api.get<ApiResponse<Proveedor>>(`/proveedores/${id}`).then(r => r.data.data),

  create: (body: ProveedorPayload) =>
    api.post<ApiResponse<Proveedor>>('/proveedores', body).then(r => r.data.data),

  update: (id: number, body: Partial<ProveedorPayload>) =>
    api.patch<ApiResponse<Proveedor>>(`/proveedores/${id}`, body).then(r => r.data.data),

  remove: (id: number) =>
    api.delete(`/proveedores/${id}`).then(r => r.data),
};
