import api from './client';

const base = '/prestamista';
const r = (res: any) => res.data?.data ?? res.data;

export const prestamistalApi = {
  // Dashboard
  getDashboard: () => api.get(`${base}/dashboard`).then(r),

  // Deudores
  getDeudores: (params?: any) => api.get(`${base}/deudores`, { params }).then(r),
  getDeudor:   (id: number)   => api.get(`${base}/deudores/${id}`).then(r),
  crearDeudor: (body: any)    => api.post(`${base}/deudores`, body).then(r),
  updateDeudor:(id: number, body: any) => api.patch(`${base}/deudores/${id}`, body).then(r),

  // Productos préstamo
  getProductos: () => api.get(`${base}/productos-prestamo`).then(r),
  crearProducto: (body: any) => api.post(`${base}/productos-prestamo`, body).then(r),
  updateProducto: (id: number, body: any) => api.patch(`${base}/productos-prestamo/${id}`, body).then(r),

  // Solicitudes
  getSolicitudes: (params?: any) => api.get(`${base}/solicitudes`, { params }).then(r),
  getSolicitud:   (id: number)   => api.get(`${base}/solicitudes/${id}`).then(r),
  crearSolicitud: (body: any)    => api.post(`${base}/solicitudes`, body).then(r),
  decidirSolicitud: (id: number, body: any) => api.post(`${base}/solicitudes/${id}/decidir`, body).then(r),

  // Préstamos
  getPrestamos:  (params?: any) => api.get(`${base}/prestamos`, { params }).then(r),
  getPrestamo:   (id: number)   => api.get(`${base}/prestamos/${id}`).then(r),
  crearPrestamo: (body: any)    => api.post(`${base}/prestamos`, body).then(r),
  simular:       (body: any)    => api.post(`${base}/prestamos/simular`, body).then(r),
  cancelarPrestamo: (id: number, motivo?: string) =>
    api.patch(`${base}/prestamos/${id}/cancelar`, { motivo }).then(r),

  // Pagos
  getPagosByPrestamo: (prestamoId: number) => api.get(`${base}/pagos/prestamo/${prestamoId}`).then(r),
  registrarPago: (body: any) => api.post(`${base}/pagos`, body).then(r),

  // Garantías
  getGarantiasByPrestamo: (prestamoId: number) => api.get(`${base}/garantias/prestamo/${prestamoId}`).then(r),
  getGarantiasByDeudor:   (deudorId: number)   => api.get(`${base}/garantias/deudor/${deudorId}`).then(r),
  crearGarantia:  (body: any)            => api.post(`${base}/garantias`, body).then(r),
  updateGarantia: (id: number, body: any) => api.patch(`${base}/garantias/${id}`, body).then(r),

  // Cobranza
  getCarteraVencida: (params?: any) => api.get(`${base}/cobranza/cartera-vencida`, { params }).then(r),
  getResumenCobranza: () => api.get(`${base}/cobranza/resumen`).then(r),
  getGestiones: (prestamoId: number) => api.get(`${base}/cobranza/prestamo/${prestamoId}/gestiones`).then(r),
  registrarGestion: (body: any) => api.post(`${base}/cobranza/gestiones`, body).then(r),

  // Refinanciamiento
  refinanciar: (body: any) => api.post(`${base}/refinanciamientos`, body).then(r),

  // PDFs
  pdfAmortizacion: (prestamoId: number) => `${api.defaults.baseURL}${base}/pdf/amortizacion/${prestamoId}`,
  pdfRecibo:       (pagoId: number)     => `${api.defaults.baseURL}${base}/pdf/recibo/${pagoId}`,
  pdfEstadoCuenta: (deudorId: number)   => `${api.defaults.baseURL}${base}/pdf/estado-cuenta/${deudorId}`,

  // Reportes CSV — descarga autenticada via axios → Blob → click
  descargarReporte: async (tipo: string, nombreArchivo: string, params?: Record<string, any>) => {
    const res = await api.get(`${base}/reportes/${tipo}`, { params, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombreArchivo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
