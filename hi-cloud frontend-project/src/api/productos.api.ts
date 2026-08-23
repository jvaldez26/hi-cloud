import api from './client';
import type { ApiResponse, PaginatedData, Producto } from '../types';

export interface ProductoPayload {
  tipo?: string;   // 'producto' | 'servicio'
  codigo: string; nombre: string; precio: number;
  precio2?: number | null; precio3?: number | null;
  costo?: number | null;
  unidadMedida?: string; porcentajeIva?: number;
  stock?: number; stockMinimo?: number; categoria?: string;
  descripcion?: string; imagenUrl?: string;
  almacenId?: number;
  ubicacionId?: number;
  marca?: string;
  modelo?: string;
  referencia?: string;
  // Balanzas etiquetadoras
  plu?: number | null;
  esPesable?: boolean;
}

export const productosApi = {
  list: (p = 1, limit = 10, search = '', incluirSinStock = false) =>
    api.get<ApiResponse<PaginatedData<Producto>>>(
      `/productos?page=${p}&limit=${limit}&search=${search}${incluirSinStock ? '&incluirSinStock=true' : ''}`,
    ).then(r => r.data.data),

  /**
   * Catálogo completo para el POS — solo los campos que el POS lee.
   *
   * Sustituye a list(1, 5000, '', true) como fuente del catálogo en memoria.
   * Mismos productos (incluidos los de stock 0), pero sin las columnas que el
   * POS nunca consulta ni el stockPorAlmacen que se calculaba y se descartaba.
   */
  catalogoPos: () =>
    api.get<ApiResponse<{ data: Producto[]; meta: { total: number } }>>('/productos/catalogo-pos')
      .then(r => (r.data as any)?.data ?? r.data),

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

  categorias: () =>
    api.get<ApiResponse<string[]>>('/productos/categorias').then(r => r.data.data ?? []),

  marcas: () =>
    api.get<ApiResponse<string[]>>('/productos/marcas').then(r => r.data.data ?? []),

  historialCompras: (id: number) =>
    api.get(`/productos/${id}/historial-compras`).then((r: any) => r.data?.data ?? r.data),

  /**
   * URL firmada de S3 para la imagen de un producto (válida 5 minutos).
   * Usar para vistas de un solo producto (modal, preview de formulario).
   * Para el catálogo completo usar bulkImagenUrls.
   */
  getImagenUrl: (id: number): Promise<{ url: string; expiresAt: string }> =>
    api.get(`/productos/${id}/imagen-url`).then((r: any) => r.data?.data ?? r.data),

  /**
   * URL firmadas en lote (máx 500 ids, válidas 5 min).
   * Devuelve { [productoId]: signedUrl } solo para los que tienen imagen.
   * Una sola petición carga todas las imágenes del catálogo POS.
   */
  bulkImagenUrls: (ids: number[]): Promise<Record<number, string>> =>
    api.post('/productos/imagen-urls', { ids }).then((r: any) => r.data?.data ?? r.data ?? {}),

  /** Preview del ajuste de precios al público — SOLO LECTURA, no escribe nada */
  previewAjustePrecios: (body: PreviewAjusteBody) =>
    api.post<ApiResponse<PreviewAjusteResp>>('/productos/ajuste-precios/preview', body)
      .then(r => r.data.data),

  /** Persiste el ajuste aprobado en el preview. Devuelve { actualizados: N }. */
  aplicarAjustePrecios: (body: AplicarAjusteBody) =>
    api.post<ApiResponse<{ actualizados: number }>>('/productos/ajuste-precios/aplicar', body)
      .then(r => r.data.data),
};

// ── Ajuste de precios al público ────────────────────────────────────────────
export type ModoRedondeo =
  | 'entero' | 'multiplo5' | 'multiplo10' | 'terminacion95' | 'terminacion99';
export type DireccionRedondeo = 'cercano' | 'arriba' | 'abajo';

export interface PreviewAjusteBody {
  /** Selección manual — tiene prioridad sobre los demás filtros. */
  productoIds?:          number[];
  categoria?:            string;
  marca?:                string;
  /** Búsqueda parcial por nombre o código. */
  busqueda?:             string;
  /** Solo productos cuyo precio al público actual tiene centavos (el default al abrir el modal). */
  soloNoRedondos?:       boolean;
  /** Solo productos con stock > 0. */
  soloConExistencia?:    boolean;
  /** Solo productos vendidos en los últimos N meses. */
  vendidosUltimosMeses?: number;
  /** Rango de precio final al público actual. */
  precioMin?:            number;
  precioMax?:            number;
  /** Opt-in explícito para procesar todo el catálogo sin filtros de scope. */
  todoElCatalogo?:       boolean;
  modo:                  ModoRedondeo;
  direccion?:            DireccionRedondeo;
  soloConCambio?:        boolean;
}

export interface FilaAjuste {
  precioFinalActual:    number;
  precioFinalPropuesto: number;
  baseActual:           number;
  baseNueva:            number;
  diferencia:           number;
  verificado:           boolean;
  motivoExclusion?:     string;
}

export interface FilaAjusteProducto extends FilaAjuste {
  id: number; codigo?: string; nombre: string;
  categoria?: string; marca?: string; porcentajeIva: number;
  precio2: FilaAjuste | null;
  precio3: FilaAjuste | null;
}

export interface AplicarAjusteBody {
  filas: Array<{
    id:           number;
    baseNueva:    number;
    precio2Nueva?: number;
    precio3Nueva?: number;
  }>;
}

export interface PreviewAjusteResp {
  filas:      FilaAjusteProducto[];
  total:      number;
  conCambio:  number;
  excluidas:  number;
  /** true cuando el conjunto supera 500 — la UI pide confirmación adicional al aplicar. */
  esGrande?:  boolean;
  aviso?:     string;
}
