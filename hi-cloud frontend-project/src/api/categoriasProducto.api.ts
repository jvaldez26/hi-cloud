import api from './client';
import type { ApiResponse } from '../types';

export interface CategoriaProducto {
  id: number;
  nombre: string;
  descripcion: string | null;
  categoriaPadreId: number | null;
  categoriaPadreNombre: string | null;
  /** "Padre › Hija", o solo "Hija" si no tiene padre — ya armado por el backend. */
  ruta: string;
  isActive: boolean;
}

export interface CrearCategoriaPayload {
  nombre: string;
  descripcion?: string;
  categoriaPadreId?: number | null;
}

export const categoriasProductoApi = {
  listar: (incluirInactivas = false) =>
    api.get<ApiResponse<CategoriaProducto[]>>(
      `/categorias-productos${incluirInactivas ? '?incluirInactivas=true' : ''}`,
    ).then(r => r.data.data ?? []),

  crear: (body: CrearCategoriaPayload) =>
    api.post<ApiResponse<CategoriaProducto>>('/categorias-productos', body).then(r => r.data.data),

  actualizar: (id: number, body: Partial<CrearCategoriaPayload>) =>
    api.patch<ApiResponse<CategoriaProducto>>(`/categorias-productos/${id}`, body).then(r => r.data.data),

  desactivar: (id: number) =>
    api.patch<ApiResponse<{ categoria: CategoriaProducto; productosAfectados: number }>>(
      `/categorias-productos/${id}/desactivar`,
    ).then(r => r.data.data),

  activar: (id: number) =>
    api.patch<ApiResponse<CategoriaProducto>>(`/categorias-productos/${id}/activar`).then(r => r.data.data),

  fusionar: (id: number, categoriaDestinoId: number) =>
    api.patch<ApiResponse<{ productosReasignados: number; subcategoriasReasignadas: number }>>(
      `/categorias-productos/${id}/fusionar`, { categoriaDestinoId },
    ).then(r => r.data.data),
};
