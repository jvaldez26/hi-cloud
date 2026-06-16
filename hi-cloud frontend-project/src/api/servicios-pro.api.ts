import api from './client';

const BASE = '/servicios-pro';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const serviciosProApi = {
  // Dashboard
  getDashboard: () => api.get(`${BASE}/dashboard`).then(r => r.data),

  // Profesionales
  getProfesionales: () => api.get(`${BASE}/profesionales`).then(r => r.data),
  crearProfesional:       (data: any)           => api.post(`${BASE}/profesionales`, data).then(r => r.data),
  actualizarProfesional:  (id: number, data: any) => api.patch(`${BASE}/profesionales/${id}`, data).then(r => r.data),
  getProfesionalTiempo:   (id: number, params?: any) => api.get(`${BASE}/profesionales/${id}/tiempo`, { params }).then(r => r.data),
  getProfesionalCarga:    (id: number)           => api.get(`${BASE}/profesionales/${id}/carga`).then(r => r.data),

  // Expedientes
  getExpedientes:        (params?: any)          => api.get(`${BASE}/expedientes`, { params }).then(r => r.data),
  crearExpediente:       (data: any)             => api.post(`${BASE}/expedientes`, data).then(r => r.data),
  getExpediente:         (id: number)            => api.get(`${BASE}/expedientes/${id}`).then(r => r.data),
  actualizarExpediente:  (id: number, data: any) => api.patch(`${BASE}/expedientes/${id}`, data).then(r => r.data),
  getExpedienteResumen:  (id: number)            => api.get(`${BASE}/expedientes/${id}/resumen`).then(r => r.data),
  getExpedienteTiempo:   (id: number, params?: any) => api.get(`${BASE}/expedientes/${id}/tiempo`, { params }).then(r => r.data),
  getExpedienteTareas:   (id: number)            => api.get(`${BASE}/expedientes/${id}/tareas`).then(r => r.data),
  getExpedienteGastos:   (id: number)            => api.get(`${BASE}/expedientes/${id}/gastos`).then(r => r.data),
  getExpedienteDocumentos: (id: number)          => api.get(`${BASE}/expedientes/${id}/documentos`).then(r => r.data),
  getExpedienteReuniones: (id: number)           => api.get(`${BASE}/expedientes/${id}/reuniones`).then(r => r.data),
  generarFactura:        (id: number, data: any) => api.post(`${BASE}/expedientes/${id}/generar-factura`, data).then(r => r.data),
  downloadEstadoCuentaPdf: async (id: number) => {
    const blob = await api.get(`${BASE}/expedientes/${id}/estado-cuenta-pdf`, { responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `estado-cuenta-${id}.pdf`);
  },

  // Tareas
  getTareas:              (params?: any)          => api.get(`${BASE}/tareas`, { params }).then(r => r.data),
  crearTarea:             (data: any)             => api.post(`${BASE}/tareas`, data).then(r => r.data),
  actualizarTarea:        (id: number, data: any) => api.patch(`${BASE}/tareas/${id}`, data).then(r => r.data),
  actualizarEstadoTarea:  (id: number, estado: string) => api.patch(`${BASE}/tareas/${id}/estado`, { estado }).then(r => r.data),
  eliminarTarea:          (id: number)            => api.delete(`${BASE}/tareas/${id}`).then(r => r.data),

  // Tiempo
  getTiempo:        (params?: any)          => api.get(`${BASE}/tiempo`, { params }).then(r => r.data),
  crearTiempo:      (data: any)             => api.post(`${BASE}/tiempo`, data).then(r => r.data),
  actualizarTiempo: (id: number, data: any) => api.patch(`${BASE}/tiempo/${id}`, data).then(r => r.data),
  eliminarTiempo:   (id: number)            => api.delete(`${BASE}/tiempo/${id}`).then(r => r.data),
  iniciarTimer:     (data: any)             => api.post(`${BASE}/tiempo/timer/start`, data).then(r => r.data),
  detenerTimer:     (data: any)             => api.post(`${BASE}/tiempo/timer/stop`, data).then(r => r.data),
  getTimerActivo:   (profesionalId: number) => api.get(`${BASE}/tiempo/timer/activo`, { params: { profesionalId } }).then(r => r.data),

  // Gastos
  getGastos:        (params?: any)          => api.get(`${BASE}/gastos`, { params }).then(r => r.data),
  crearGasto:       (data: any)             => api.post(`${BASE}/gastos`, data).then(r => r.data),
  actualizarGasto:  (id: number, data: any) => api.patch(`${BASE}/gastos/${id}`, data).then(r => r.data),

  // Contratos
  getContratos:       (params?: any)          => api.get(`${BASE}/contratos`, { params }).then(r => r.data),
  crearContrato:      (data: any)             => api.post(`${BASE}/contratos`, data).then(r => r.data),
  getContrato:        (id: number)            => api.get(`${BASE}/contratos/${id}`).then(r => r.data),
  actualizarContrato: (id: number, data: any) => api.patch(`${BASE}/contratos/${id}`, data).then(r => r.data),
  marcarContratoFirmado: (id: number)         => api.patch(`${BASE}/contratos/${id}/firmar`).then(r => r.data),
  downloadContratoPdf: async (id: number) => {
    const blob = await api.get(`${BASE}/contratos/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `contrato-${id}.pdf`);
  },

  // Documentos
  crearDocumento:    (data: any) => api.post(`${BASE}/documentos`, data).then(r => r.data),
  eliminarDocumento: (id: number) => api.delete(`${BASE}/documentos/${id}`).then(r => r.data),

  // Reuniones
  getReuniones:      (params?: any)          => api.get(`${BASE}/reuniones`, { params }).then(r => r.data),
  crearReunion:      (data: any)             => api.post(`${BASE}/reuniones`, data).then(r => r.data),
  actualizarReunion: (id: number, data: any) => api.patch(`${BASE}/reuniones/${id}`, data).then(r => r.data),

  // Honorarios
  getHonorarios:      (params?: any)          => api.get(`${BASE}/honorarios`, { params }).then(r => r.data),
  generarHonorarios:  (data: any)             => api.post(`${BASE}/honorarios/generar`, data).then(r => r.data),
  actualizarHonorario: (id: number, data: any) => api.patch(`${BASE}/honorarios/${id}`, data).then(r => r.data),
  enviarHonorario:    (id: number)            => api.post(`${BASE}/honorarios/${id}/enviar`).then(r => r.data),
  marcarHonorarioPagado: (id: number, fechaPago: string) => api.patch(`${BASE}/honorarios/${id}/pagar`, { fechaPago }).then(r => r.data),
  downloadHonorarioPdf: async (id: number) => {
    const blob = await api.get(`${BASE}/honorarios/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `honorario-${id}.pdf`);
  },

  // Retainers
  getRetainers:         (params?: any)          => api.get(`${BASE}/retainers`, { params }).then(r => r.data),
  crearRetainer:        (data: any)             => api.post(`${BASE}/retainers`, data).then(r => r.data),
  actualizarRetainer:   (id: number, data: any) => api.patch(`${BASE}/retainers/${id}`, data).then(r => r.data),
  registrarPagoRetainer: (id: number, data: any) => api.post(`${BASE}/retainers/${id}/pagar`, data).then(r => r.data),
  getHistorialRetainer: (id: number)            => api.get(`${BASE}/retainers/${id}/historial`).then(r => r.data),
  facturarMesRetainer:  (id: number)            => api.post(`${BASE}/retainers/${id}/facturar-mes`).then(r => r.data),

  // Reportes
  getReporteTiempo:       (params?: any) => api.get(`${BASE}/reportes/tiempo`, { params }).then(r => r.data),
  getReporteRentabilidad: (params?: any) => api.get(`${BASE}/reportes/rentabilidad`, { params }).then(r => r.data),
  downloadReporteTiempoPdf: async (params?: any) => {
    const blob = await api.get(`${BASE}/reportes/tiempo/pdf`, { params, responseType: 'blob' }).then(r => r.data);
    downloadBlob(blob, `reporte-tiempo.pdf`);
  },
};
