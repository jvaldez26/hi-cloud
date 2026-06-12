import api from './client';

const d = (r: any) => r.data?.data ?? r.data;

export const tallerApi = {
  // Dashboard
  dashboard: () => api.get('/taller/dashboard').then(d),

  // Vehículos
  vehiculos: (params?: { page?: number; limit?: number; search?: string; clienteId?: number }) =>
    api.get('/taller/vehiculos', { params }).then(d),
  vehiculo: (id: number) => api.get(`/taller/vehiculos/${id}`).then(d),
  buscarPlaca: (placa: string) => api.get('/taller/vehiculos/buscar-placa', { params: { placa } }).then(d),
  crearVehiculo: (b: any) => api.post('/taller/vehiculos', b).then(d),
  actualizarVehiculo: (id: number, b: any) => api.put(`/taller/vehiculos/${id}`, b).then(d),
  historialVehiculo: (id: number) => api.get(`/taller/vehiculos/${id}/historial`).then(d),
  ordenesVehiculo: (id: number) => api.get(`/taller/vehiculos/${id}/ordenes`).then(d),

  // Técnicos
  tecnicos: () => api.get('/taller/tecnicos').then(d),
  crearTecnico: (b: any) => api.post('/taller/tecnicos', b).then(d),
  actualizarTecnico: (id: number, b: any) => api.put(`/taller/tecnicos/${id}`, b).then(d),

  // Órdenes
  ordenes: (params?: { page?: number; limit?: number; estado?: string; tecnicoId?: number; desde?: string; hasta?: string; vehiculoId?: number; search?: string }) =>
    api.get('/taller/ordenes', { params }).then(d),
  orden: (id: number) => api.get(`/taller/ordenes/${id}`).then(d),
  crearOrden: (b: any) => api.post('/taller/ordenes', b).then(d),
  actualizarOrden: (id: number, b: any) => api.put(`/taller/ordenes/${id}`, b).then(d),
  cambiarEstado: (id: number, b: { estado: string; notas?: string }) =>
    api.patch(`/taller/ordenes/${id}/estado`, b).then(d),
  aprobarOrden: (id: number, b: any) => api.patch(`/taller/ordenes/${id}/aprobar`, b).then(d),
  facturarOrden: (id: number, b: any) => api.post(`/taller/ordenes/${id}/facturar`, b).then(d),
  pdfOrden: (id: number) => `${api.defaults.baseURL}/taller/ordenes/${id}/pdf`,
  pdfPresupuesto: (id: number) => `${api.defaults.baseURL}/taller/ordenes/${id}/pdf-presupuesto`,

  // Servicios
  agregarServicio: (ordenId: number, b: any) => api.post(`/taller/ordenes/${ordenId}/servicios`, b).then(d),
  actualizarServicio: (ordenId: number, id: number, b: any) =>
    api.put(`/taller/ordenes/${ordenId}/servicios/${id}`, b).then(d),
  eliminarServicio: (ordenId: number, id: number) =>
    api.delete(`/taller/ordenes/${ordenId}/servicios/${id}`).then(d),

  // Repuestos
  agregarRepuesto: (ordenId: number, b: any) => api.post(`/taller/ordenes/${ordenId}/repuestos`, b).then(d),
  actualizarRepuesto: (ordenId: number, id: number, b: any) =>
    api.put(`/taller/ordenes/${ordenId}/repuestos/${id}`, b).then(d),
  eliminarRepuesto: (ordenId: number, id: number) =>
    api.delete(`/taller/ordenes/${ordenId}/repuestos/${id}`).then(d),

  // Diagnósticos
  agregarDiagnostico: (ordenId: number, b: any) => api.post(`/taller/ordenes/${ordenId}/diagnosticos`, b).then(d),
  diagnosticos: (ordenId: number) => api.get(`/taller/ordenes/${ordenId}/diagnosticos`).then(d),

  // Checklist
  checklist: (ordenId: number) => api.get(`/taller/ordenes/${ordenId}/checklist`).then(d),
  guardarChecklist: (ordenId: number, b: any) => api.put(`/taller/ordenes/${ordenId}/checklist`, b).then(d),

  // Citas
  citas: (params?: { fecha?: string; tecnicoId?: number; estado?: string }) =>
    api.get('/taller/citas', { params }).then(d),
  crearCita: (b: any) => api.post('/taller/citas', b).then(d),
  actualizarCita: (id: number, b: any) => api.put(`/taller/citas/${id}`, b).then(d),

  // Catálogo
  catalogo: () => api.get('/taller/catalogo').then(d),
  crearServicioCatalogo: (b: any) => api.post('/taller/catalogo', b).then(d),
  actualizarServicioCatalogo: (id: number, b: any) => api.put(`/taller/catalogo/${id}`, b).then(d),

  // Reportes
  reporteProductividad: (params?: { desde?: string; hasta?: string }) =>
    api.get('/taller/reportes/productividad', { params }).then(d),
  reporteServiciosMasSolicitados: (params?: { desde?: string; hasta?: string }) =>
    api.get('/taller/reportes/servicios-mas-solicitados', { params }).then(d),
  reporteIngresos: (params?: { desde?: string; hasta?: string }) =>
    api.get('/taller/reportes/ingresos', { params }).then(d),
  reporteVehiculosFrecuentes: (params?: { desde?: string; hasta?: string }) =>
    api.get('/taller/reportes/vehiculos-frecuentes', { params }).then(d),
};
