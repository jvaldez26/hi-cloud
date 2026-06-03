import api from './client';
import type { ApiResponse, PaginatedData, Producto } from '../types';

export interface ProductoPayload {
  tipo?: string;   // 'producto' | 'servicio'
  codigo: string; nombre: string; precio: number;
  unidadMedida?: string; porcentajeIva?: number;
  stock?: number; stockMinimo?: number; categoria?: string;
  descripcion?: string; imagenUrl?: string;
  almacenId?: number;
}

export const productosApi = {
  list: (p = 1, limit = 10, search = '') =>
    api.get<ApiResponse<PaginatedData<Producto>>>(`/productos?page=${p}&limit=${limit}&search=${search}`)
       .then(r => r.data.data),

  getOne: (id: number) =>
    api.get<ApiResponse<Producto>>(`/productos/${id}`).then(r => r.data.data),

  create: (body: ProductoPayload) =>
    api.post<ApiResponse<Producto>>('/productos', body).then(r => r.data.data),

  update: (id: number, body: Partial<ProductoPayload>) =>
    api.patch<ApiResponse<Producto>>(`/productos/${id}`, body).then(r => r.data.data),

  remove: (id: number) =>
    api.delete(`/productos/${id}`).then(r => r.data),

  stockBajo: () =>
    api.get<ApiResponse<Producto[]>>('/productos/stock-bajo').then(r => r.data.data),
};
