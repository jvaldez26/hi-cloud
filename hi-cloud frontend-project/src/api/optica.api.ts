import api from './client';

const d = (r: any) => r.data?.data ?? r.data;

export const opticaApi = {
  // Dashboard
  dashboard:      () => api.get('/optica/dashboard').then(d),
  estadisticas:   () => api.get('/optica/estadisticas').then(d),

  // Pacientes
  pacientes: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get('/optica/pacientes', { params }).then(d),
  paciente:         (id: number)     => api.get(`/optica/pacientes/${id}`).then(d),
  historialPaciente: (id: number)    => api.get(`/optica/pacientes/${id}/historial`).then(d),
  crearPaciente:    (b: any)         => api.post('/optica/pacientes', b).then(d),
  actualizarPaciente: (id: number, b: any) => api.patch(`/optica/pacientes/${id}`, b).then(d),
  eliminarPaciente: (id: number)     => api.delete(`/optica/pacientes/${id}`).then(d),

  // Médicos
  medicos:          ()               => api.get('/optica/medicos').then(d),
  crearMedico:      (b: any)         => api.post('/optica/medicos', b).then(d),
  actualizarMedico: (id: number, b: any) => api.patch(`/optica/medicos/${id}`, b).then(d),
  eliminarMedico:   (id: number)     => api.delete(`/optica/medicos/${id}`).then(d),

  // Citas
  citas: (params?: { page?: number; limit?: number; estado?: string; fecha?: string }) =>
    api.get('/optica/citas', { params }).then(d),
  cita:             (id: number)     => api.get(`/optica/citas/${id}`).then(d),
  crearCita:        (b: any)         => api.post('/optica/citas', b).then(d),
  actualizarCita:   (id: number, b: any) => api.patch(`/optica/citas/${id}`, b).then(d),

  // Consultas
  consultas: (params?: { page?: number; limit?: number; pacienteId?: number }) =>
    api.get('/optica/consultas', { params }).then(d),
  consulta:           (id: number)   => api.get(`/optica/consultas/${id}`).then(d),
  crearConsulta:      (b: any)       => api.post('/optica/consultas', b).then(d),
  actualizarConsulta: (id: number, b: any) => api.patch(`/optica/consultas/${id}`, b).then(d),

  // Recetas
  recetas: (params?: { page?: number; limit?: number; pacienteId?: number }) =>
    api.get('/optica/recetas', { params }).then(d),
  receta:           (id: number)     => api.get(`/optica/recetas/${id}`).then(d),
  crearReceta:      (b: any)         => api.post('/optica/recetas', b).then(d),
  actualizarReceta: (id: number, b: any) => api.patch(`/optica/recetas/${id}`, b).then(d),
  pdfReceta:        (id: number)     =>
    api.get(`/optica/recetas/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),

  // Órdenes de Trabajo
  ordenes: (params?: { page?: number; limit?: number; estado?: string }) =>
    api.get('/optica/ordenes-trabajo', { params }).then(d),
  orden:           (id: number)      => api.get(`/optica/ordenes-trabajo/${id}`).then(d),
  crearOrden:      (b: any)          => api.post('/optica/ordenes-trabajo', b).then(d),
  actualizarOrden: (id: number, b: any) => api.patch(`/optica/ordenes-trabajo/${id}`, b).then(d),
  entregarOrden: (id: number, b: { montoCobrado: number; metodoPago: string; notas?: string }) =>
    api.patch(`/optica/ordenes-trabajo/${id}/entregar`, b).then(d),
  facturarOrden:   (id: number, clienteId: number, tipoNcf?: string) =>
    api.post(`/optica/ordenes-trabajo/${id}/facturar`, { clienteId, tipoNcf }).then(d),

  // Reclamaciones ARS
  reclamaciones: (params?: { page?: number; limit?: number; estado?: string }) =>
    api.get('/optica/reclamaciones-ars', { params }).then(d),
  reclamacion:           (id: number) => api.get(`/optica/reclamaciones-ars/${id}`).then(d),
  crearReclamacion:      (b: any)     => api.post('/optica/reclamaciones-ars', b).then(d),
  actualizarReclamacion: (id: number, b: any) => api.patch(`/optica/reclamaciones-ars/${id}`, b).then(d),
  reporteArs: (params?: { desde?: string; hasta?: string; arsNombre?: string }) =>
    api.get('/optica/reclamaciones-ars/reporte', { params }).then(d),

  // Inventario
  inventarioPOSCatalogo: () =>
    api.get('/optica/inventario/pos-catalogo').then(r => r.data?.data ?? r.data ?? []),
  inventarioResumen:   () => api.get('/optica/inventario/resumen').then(d),
  inventario: (params?: { page?: number; limit?: number; tipo?: string; search?: string }) =>
    api.get('/optica/inventario', { params }).then(d),
  crearInventario:      (b: any)          => api.post('/optica/inventario', b).then(d),
  actualizarInventario: (id: number, b: any) => api.patch(`/optica/inventario/${id}`, b).then(d),
  ajustarStock:         (id: number, delta: number, motivo?: string) =>
    api.post(`/optica/inventario/${id}/ajustar-stock`, { delta, motivo }).then(d),
  eliminarInventario:   (id: number)      => api.delete(`/optica/inventario/${id}`).then(d),
};
