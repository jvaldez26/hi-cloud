import api from './client';

const BASE = '/servicios-pro';
const d = (r: any) => r.data?.data ?? r.data;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const serviciosProApi = {
  // Dashboard
  getDashboard: () => api.get(`${BASE}/dashboard`).then(d),

  // Profesionales
  getProfesionales: () => api.get(`${BASE}/profesionales`).then(d),
  crearProfesional:       (data: any)           => api.post(`${BASE}/profesionales`, data).then(d),
  actualizarProfesional:  (id: number, data: any) => api.patch(`${BASE}/profesionales/${id}`, data).then(d),
  getProfesionalTiempo:   (id: number, params?: any) => api.get(`${BASE}/profesionales/${id}/tiempo`, { params }).then(d),
  getProfesionalCarga:    (id: number)           => api.get(`${BASE}/profesionales/${id}/carga`).then(d),

  // Expedientes
  getExpedientes:        (params?: any)          => api.get(`${BASE}/expedientes`, { params }).then(d),
  crearExpediente:       (data: any)             => api.post(`${BASE}/expedientes`, data).then(d),
  getExpediente:         (id: number)            => api.get(`${BASE}/expedientes/${id}`).then(d),
  actualizarExpediente:  (id: number, data: any) => api.patch(`${BASE}/expedientes/${id}`, data).then(d),
  getExpedienteResumen:  (id: number)            => api.get(`${BASE}/expedientes/${id}/resumen`).then(d),
  getExpedienteTiempo:   (id: number, params?: any) => api.get(`${BASE}/expedientes/${id}/tiempo`, { params }).then(d),
  getExpedienteTareas:   (id: number)            => api.get(`${BASE}/expedientes/${id}/tareas`).then(d),
  getExpedienteGastos:   (id: number)            => api.get(`${BASE}/expedientes/${id}/gastos`).then(d),
  getExpedienteDocumentos: (id: number)          => api.get(`${BASE}/expedientes/${id}/documentos`).then(d),
  getExpedienteReuniones: (id: number)           => api.get(`${BASE}/expedientes/${id}/reuniones`).then(d),
  generarFactura:        (id: number, data: any) => api.post(`${BASE}/expedientes/${id}/generar-factura`, data).then(d),
  downloadEstadoCuentaPdf: async (id: number) => {
    const blob = await api.get(`${BASE}/expedientes/${id}/estado-cuenta-pdf`, { responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `estado-cuenta-${id}.pdf`);
  },

  // Tareas
  getTareas:              (params?: any)          => api.get(`${BASE}/tareas`, { params }).then(d),
  crearTarea:             (data: any)             => api.post(`${BASE}/tareas`, data).then(d),
  actualizarTarea:        (id: number, data: any) => api.patch(`${BASE}/tareas/${id}`, data).then(d),
  actualizarEstadoTarea:  (id: number, estado: string) => api.patch(`${BASE}/tareas/${id}/estado`, { estado }).then(d),
  eliminarTarea:          (id: number)            => api.delete(`${BASE}/tareas/${id}`).then(d),

  // Tiempo
  getTiempo:        (params?: any)          => api.get(`${BASE}/tiempo`, { params }).then(d),
  crearTiempo:      (data: any)             => api.post(`${BASE}/tiempo`, data).then(d),
  actualizarTiempo: (id: number, data: any) => api.patch(`${BASE}/tiempo/${id}`, data).then(d),
  eliminarTiempo:   (id: number)            => api.delete(`${BASE}/tiempo/${id}`).then(d),
  iniciarTimer:     (data: any)             => api.post(`${BASE}/tiempo/timer/start`, data).then(d),
  detenerTimer:     (data: any)             => api.post(`${BASE}/tiempo/timer/stop`, data).then(d),
  getTimerActivo:   (profesionalId: number) => api.get(`${BASE}/tiempo/timer/activo`, { params: { profesionalId } }).then(d),

  // Gastos
  getGastos:        (params?: any)          => api.get(`${BASE}/gastos`, { params }).then(d),
  crearGasto:       (data: any)             => api.post(`${BASE}/gastos`, data).then(d),
  actualizarGasto:  (id: number, data: any) => api.patch(`${BASE}/gastos/${id}`, data).then(d),

  // Contratos
  getContratos:       (params?: any)          => api.get(`${BASE}/contratos`, { params }).then(d),
  crearContrato:      (data: any)             => api.post(`${BASE}/contratos`, data).then(d),
  getContrato:        (id: number)            => api.get(`${BASE}/contratos/${id}`).then(d),
  actualizarContrato: (id: number, data: any) => api.patch(`${BASE}/contratos/${id}`, data).then(d),
  marcarContratoFirmado: (id: number)         => api.patch(`${BASE}/contratos/${id}/firmar`).then(d),
  downloadContratoPdf: async (id: number) => {
    const blob = await api.get(`${BASE}/contratos/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `contrato-${id}.pdf`);
  },

  // Documentos
  crearDocumento:    (data: any) => api.post(`${BASE}/documentos`, data).then(d),
  eliminarDocumento: (id: number) => api.delete(`${BASE}/documentos/${id}`).then(d),

  // Reuniones
  getReuniones:      (params?: any)          => api.get(`${BASE}/reuniones`, { params }).then(d),
  crearReunion:      (data: any)             => api.post(`${BASE}/reuniones`, data).then(d),
  actualizarReunion: (id: number, data: any) => api.patch(`${BASE}/reuniones/${id}`, data).then(d),

  // Honorarios
  getHonorarios:      (params?: any)          => api.get(`${BASE}/honorarios`, { params }).then(d),
  generarHonorarios:  (data: any)             => api.post(`${BASE}/honorarios/generar`, data).then(d),
  actualizarHonorario: (id: number, data: any) => api.patch(`${BASE}/honorarios/${id}`, data).then(d),
  enviarHonorario:    (id: number)            => api.post(`${BASE}/honorarios/${id}/enviar`).then(d),
  marcarHonorarioPagado: (id: number, fechaPago: string) => api.patch(`${BASE}/honorarios/${id}/pagar`, { fechaPago }).then(d),
  downloadHonorarioPdf: async (id: number) => {
    const blob = await api.get(`${BASE}/honorarios/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `honorario-${id}.pdf`);
  },

  // Retainers
  getRetainers:         (params?: any)          => api.get(`${BASE}/retainers`, { params }).then(d),
  crearRetainer:        (data: any)             => api.post(`${BASE}/retainers`, data).then(d),
  actualizarRetainer:   (id: number, data: any) => api.patch(`${BASE}/retainers/${id}`, data).then(d),
  registrarPagoRetainer: (id: number, data: any) => api.post(`${BASE}/retainers/${id}/pagar`, data).then(d),
  getHistorialRetainer: (id: number)            => api.get(`${BASE}/retainers/${id}/historial`).then(d),
  facturarMesRetainer:  (id: number)            => api.post(`${BASE}/retainers/${id}/facturar-mes`).then(d),

  // Reportes
  getReporteTiempo:       (params?: any) => api.get(`${BASE}/reportes/tiempo`, { params }).then(d),
  getReporteRentabilidad: (params?: any) => api.get(`${BASE}/reportes/rentabilidad`, { params }).then(d),
  downloadReporteTiempoPdf: async (params?: any) => {
    const blob = await api.get(`${BASE}/reportes/tiempo/pdf`, { params, responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `reporte-tiempo.pdf`);
  },
};
