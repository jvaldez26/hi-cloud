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
  // Motor v2 — vista previa de tasaEquivalentePorPeriodo/tasaAnualNominal/TEA
  vistaTasa: (body: { tasa: any; frecuencia: string }) => api.post(`${base}/productos-prestamo/vista-tasa`, body).then(r),

  // Feriados (motor v2, Configuración del módulo)
  getFeriados: (anio: number) => api.get(`${base}/feriados`, { params: { anio } }).then(r),
  crearFeriado: (body: any) => api.post(`${base}/feriados`, body).then(r),
  actualizarFeriado: (id: number, body: any) => api.patch(`${base}/feriados/${id}`, body).then(r),
  eliminarFeriado: (id: number) => api.delete(`${base}/feriados/${id}`).then(r),

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
  recalcularPrestamo: (id: number) =>
    api.patch(`${base}/prestamos/${id}/recalcular`).then(r),

  // Pagos
  getPagosByPrestamo: (prestamoId: number) => api.get(`${base}/pagos/prestamo/${prestamoId}`).then(r),
  // headers: x-supervisor-token cuando la fecha del pago es retroactiva (ver
  // RequiereSupervisor('pago_retroactivo') en pagos.controller.ts).
  registrarPago: (body: any, headers?: Record<string, string>) =>
    api.post(`${base}/pagos`, body, { headers }).then(r),
  previewPago: (body: any) => api.post(`${base}/pagos/preview`, body).then(r),
  enviarReciboCorreo: (pagoId: number, body: { email: string; cc?: string; cco?: string }) =>
    api.post(`${base}/pagos/${pagoId}/enviar-recibo`, body).then(r),
  // Anulación con reversa — ADMIN + supervisor SIEMPRE (clave
  // 'anular_pago_prestamo', el 403 lo resuelve el interceptor global). Ver
  // docs/prestamista/etapa-2-resto.md §1.
  anularPago: (pagoId: number, motivo: string) => api.patch(`${base}/pagos/${pagoId}/anular`, { motivo }).then(r),

  // Garantías
  getGarantiasByPrestamo: (prestamoId: number) => api.get(`${base}/garantias/prestamo/${prestamoId}`).then(r),
  getGarantiasByDeudor:   (deudorId: number)   => api.get(`${base}/garantias/deudor/${deudorId}`).then(r),
  crearGarantia:  (body: any)            => api.post(`${base}/garantias`, body).then(r),
  updateGarantia: (id: number, body: any) => api.patch(`${base}/garantias/${id}`, body).then(r),
  liberarGarantia: (id: number, motivo?: string) => api.patch(`${base}/garantias/${id}/liberar`, { motivo }).then(r),
  // Supervisor SIEMPRE, motivo obligatorio (clave 'ejecutar_garantia').
  ejecutarGarantia: (id: number, motivo: string) => api.patch(`${base}/garantias/${id}/ejecutar`, { motivo }).then(r),

  // Garantes (avales personales) — CRUD + liberar (§2)
  getGarantesByPrestamo: (prestamoId: number) => api.get(`${base}/garantes/prestamo/${prestamoId}`).then(r),
  crearGarante:   (body: any)             => api.post(`${base}/garantes`, body).then(r),
  updateGarante:  (id: number, body: any) => api.patch(`${base}/garantes/${id}`, body).then(r),
  liberarGarante: (id: number, motivo?: string) => api.patch(`${base}/garantes/${id}/liberar`, { motivo }).then(r),
  eliminarGarante: (id: number) => api.delete(`${base}/garantes/${id}`).then(r),

  // Cobranza
  getCarteraVencida: (params?: any) => api.get(`${base}/cobranza/cartera-vencida`, { params }).then(r),
  getResumenCobranza: () => api.get(`${base}/cobranza/resumen`).then(r),
  getGestiones: (prestamoId: number) => api.get(`${base}/cobranza/prestamo/${prestamoId}/gestiones`).then(r),
  registrarGestion: (body: any) => api.post(`${base}/cobranza/gestiones`, body).then(r),
  notificarMoraEmail: (prestamoId: number) => api.post(`${base}/cobranza/prestamo/${prestamoId}/notificar-mora`).then(r),

  // Refinanciamiento
  refinanciar: (body: any) => api.post(`${base}/refinanciamientos`, body).then(r),

  // Desembolsos parciales (§4) — el préstamo nace en 'desembolso_parcial' si
  // se crea con desembolsoInicial < montoPrincipal.
  getDesembolsosParciales: (prestamoId: number) => api.get(`${base}/desembolsos-parciales/prestamo/${prestamoId}`).then(r),
  registrarDesembolsoParcial: (body: any) => api.post(`${base}/desembolsos-parciales`, body).then(r),

  // Reestructuración (§5) — distinto de refinanciar: el mismo préstamo, solo
  // cambia el plan de las cuotas totalmente pendientes.
  reestructurarPrestamo: (id: number, body: any) => api.patch(`${base}/prestamos/${id}/reestructurar`, body).then(r),

  // Condonación independiente (§6) — mora/interés pendiente, nunca capital.
  condonarPrestamo: (id: number, body: any) => api.patch(`${base}/prestamos/${id}/condonar`, body).then(r),

  // PDFs
  pdfAmortizacion: (prestamoId: number) => `${api.defaults.baseURL}${base}/pdf/amortizacion/${prestamoId}`,
  pdfRecibo:       (pagoId: number)     => `${api.defaults.baseURL}${base}/pdf/recibo/${pagoId}`,
  pdfEstadoCuenta: (deudorId: number)   => `${api.defaults.baseURL}${base}/pdf/estado-cuenta/${deudorId}`,
  pdfCotizacion:   (simulacionId: number) => `${api.defaults.baseURL}${base}/pdf/cotizacion/${simulacionId}`,
  // Contrato y pagaré (§7) — plantillas simples, sin redacción legal.
  pdfContrato:     (prestamoId: number) => `${api.defaults.baseURL}${base}/pdf/contrato/${prestamoId}`,
  pdfPagare:       (prestamoId: number) => `${api.defaults.baseURL}${base}/pdf/pagare/${prestamoId}`,

  // Simulaciones (Etapa 1)
  crearSimulacion: (body: any) => api.post(`${base}/simulaciones`, body).then(r),
  listarSimulaciones: (deudorId?: number) => api.get(`${base}/simulaciones`, { params: deudorId ? { deudorId } : undefined }).then(r),
  obtenerSimulacion: (id: number) => api.get(`${base}/simulaciones/${id}`).then(r),
  eliminarSimulacion: (id: number) => api.delete(`${base}/simulaciones/${id}`).then(r),
  convertirSimulacion: (id: number, body: any) => api.post(`${base}/simulaciones/${id}/convertir-solicitud`, body).then(r),

  // Vehículos
  getVehiculos: (params?: any)          => api.get(`${base}/vehiculos`, { params }).then(r),
  getVehiculo:  (id: number)            => api.get(`${base}/vehiculos/${id}`).then(r),
  crearVehiculo: (body: any)            => api.post(`${base}/vehiculos`, body).then(r),
  updateVehiculo: (id: number, body: any) => api.patch(`${base}/vehiculos/${id}`, body).then(r),
  buscarVehiculoPorPlaca: (placa: string) => api.get(`${base}/vehiculos/buscar-placa/${encodeURIComponent(placa)}`).then(r),
  alertasSeguro: ()                     => api.get(`${base}/vehiculos/alertas-seguro`).then(r),

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
