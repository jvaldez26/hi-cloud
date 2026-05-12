import api from './client';

const d = (r: any) => r.data?.data ?? r.data;

export const atributosApi = {
  // ── Atributos ─────────────────────────────────────────────────────────────
  listar:          ()               => api.get('/atributos-producto').then(d),
  crear:           (b: any)         => api.post('/atributos-producto', b).then(d),
  findOne:         (id: number)     => api.get(`/atributos-producto/${id}`).then(d),
  update:          (id: number, b: any) => api.patch(`/atributos-producto/${id}`, b).then(d),
  delete:          (id: number)     => api.delete(`/atributos-producto/${id}`).then(d),
  // ── Valores ───────────────────────────────────────────────────────────────
  agregarValor:    (atributoId: number, b: any) => api.post(`/atributos-producto/${atributoId}/valores`, b).then(d),
  deleteValor:     (id: number)     => api.delete(`/atributos-producto/valores/${id}`).then(d),
  // ── Variantes ─────────────────────────────────────────────────────────────
  variantesProducto: (productoId: number) => api.get(`/atributos-producto/variantes/producto/${productoId}`).then(d),
  crearVariante:   (b: any)         => api.post('/atributos-producto/variantes', b).then(d),
  updateVariante:  (id: number, b: any) => api.patch(`/atributos-producto/variantes/${id}`, b).then(d),
  deleteVariante:  (id: number)     => api.delete(`/atributos-producto/variantes/${id}`).then(d),
  buscarSku:       (sku: string)    => api.get(`/atributos-producto/variantes/sku/${encodeURIComponent(sku)}`).then(d),
  stockBajo:       ()               => api.get('/atributos-producto/variantes/stock-bajo').then(d),
  generarCombs:    (b: any)         => api.post('/atributos-producto/variantes/generar-combinaciones', b).then(d),
};
