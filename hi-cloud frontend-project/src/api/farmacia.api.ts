import api from './client';

const d = (r: any) => r.data?.data ?? r.data;

export const farmaciaApi = {
  // Dashboard
  dashboard: () => api.get('/farmacia/dashboard').then(d),

  // Medicamentos
  medicamentos: (p?: { page?: number; limit?: number; search?: string; categoria?: string }) =>
    api.get('/farmacia/medicamentos', { params: p }).then(d),
  buscarBarra: (codigo: string) =>
    api.get('/farmacia/medicamentos/buscar-barra', { params: { codigo } }).then(d),
  medicamento: (id: number) => api.get(`/farmacia/medicamentos/${id}`).then(d),
  crearMedicamento: (b: any) => api.post('/farmacia/medicamentos', b).then(d),
  actualizarMedicamento: (id: number, b: any) => api.put(`/farmacia/medicamentos/${id}`, b).then(d),

  // Lotes
  lotes: (p?: { page?: number; limit?: number; medicamentoId?: number; estado?: string }) =>
    api.get('/farmacia/lotes', { params: p }).then(d),
  lotesProximosVencer: (dias = 30) =>
    api.get('/farmacia/lotes/proximos-vencer', { params: { dias } }).then(d),
  crearLote: (b: any) => api.post('/farmacia/lotes', b).then(d),
  actualizarLote: (id: number, b: any) => api.patch(`/farmacia/lotes/${id}`, b).then(d),

  // Dispensaciones
  dispensaciones: (p?: { page?: number; limit?: number; fecha?: string; desde?: string; hasta?: string }) =>
    api.get('/farmacia/dispensaciones', { params: p }).then(d),
  dispensacion: (id: number) => api.get(`/farmacia/dispensaciones/${id}`).then(d),
  pdfDispensacion: (id: number) =>
    api.get(`/farmacia/dispensaciones/${id}/pdf`, { responseType: 'blob' }),
  crearDispensacion: (b: any) => api.post('/farmacia/dispensaciones', b).then(d),

  // Recepciones
  recepciones: (p?: { page?: number; limit?: number }) =>
    api.get('/farmacia/recepciones', { params: p }).then(d),
  recepcion: (id: number) => api.get(`/farmacia/recepciones/${id}`).then(d),
  crearRecepcion: (b: any) => api.post('/farmacia/recepciones', b).then(d),
  confirmarRecepcion: (id: number) => api.post(`/farmacia/recepciones/${id}/confirmar`).then(d),

  // Narcóticos
  narcoticos: (p?: { medicamentoId?: number; desde?: string; hasta?: string }) =>
    api.get('/farmacia/narcoticos', { params: p }).then(d),
  pdfNarcoticos: (p?: { medicamentoId?: number; desde?: string; hasta?: string }) =>
    api.get('/farmacia/narcoticos/pdf', { params: p, responseType: 'blob' }),

  // Devoluciones
  devoluciones: (p?: { page?: number; limit?: number }) =>
    api.get('/farmacia/devoluciones', { params: p }).then(d),
  crearDevolucion: (b: any) => api.post('/farmacia/devoluciones', b).then(d),

  // ARS
  ars: (p?: { page?: number; limit?: number; estado?: string }) =>
    api.get('/farmacia/ars', { params: p }).then(d),
  crearArs: (b: any) => api.post('/farmacia/ars', b).then(d),
  actualizarArs: (id: number, b: any) => api.patch(`/farmacia/ars/${id}`, b).then(d),

  // Reportes
  reporteMasVendidos: (p?: { desde?: string; hasta?: string }) =>
    api.get('/farmacia/reportes/mas-vendidos', { params: p }).then(d),
  reporteIngresos: (p?: { desde?: string; hasta?: string }) =>
    api.get('/farmacia/reportes/ingresos', { params: p }).then(d),
  reporteStockBajo: () => api.get('/farmacia/reportes/stock-bajo').then(d),
  reporteSinMovimiento: (dias = 30) =>
    api.get('/farmacia/reportes/sin-movimiento', { params: { dias } }).then(d),
  alertasActivas: () => api.get('/farmacia/reportes/alertas').then(d),
  pdfVencimientos: (dias = 60) =>
    api.get('/farmacia/reportes/vencimientos/pdf', { params: { dias }, responseType: 'blob' }),
};
