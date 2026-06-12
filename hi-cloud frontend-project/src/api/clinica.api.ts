import api from './client';

const d = (r: any) => r.data?.data ?? r.data;
const BASE = '/clinica';

export const clinicaApi = {
  // Dashboard
  dashboard: () => api.get(`${BASE}/dashboard`).then(d),

  // Pacientes
  listarPacientes: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get(`${BASE}/pacientes`, { params }).then(d),
  crearPaciente: (data: any) => api.post(`${BASE}/pacientes`, data).then(d),
  obtenerPaciente: (id: number) => api.get(`${BASE}/pacientes/${id}`).then(d),
  actualizarPaciente: (id: number, data: any) => api.patch(`${BASE}/pacientes/${id}`, data).then(d),
  expediente: (id: number) => api.get(`${BASE}/pacientes/${id}/expediente`).then(d),
  expedientePdf: (id: number) => api.get(`${BASE}/pacientes/${id}/expediente/pdf`, { responseType: 'blob' }).then(d),
  signosPaciente: (id: number) => api.get(`${BASE}/pacientes/${id}/signos`).then(d),

  // Médicos
  listarMedicos: () => api.get(`${BASE}/medicos`).then(d),
  crearMedico: (data: any) => api.post(`${BASE}/medicos`, data).then(d),
  actualizarMedico: (id: number, data: any) => api.patch(`${BASE}/medicos/${id}`, data).then(d),

  // Citas
  listarCitas: (params?: { page?: number; limit?: number; fecha?: string; medicoId?: number; estado?: string }) =>
    api.get(`${BASE}/citas`, { params }).then(d),
  crearCita: (data: any) => api.post(`${BASE}/citas`, data).then(d),
  actualizarCita: (id: number, data: any) => api.patch(`${BASE}/citas/${id}`, data).then(d),
  cambiarEstadoCita: (id: number, estado: string) => api.patch(`${BASE}/citas/${id}/estado`, { estado }).then(d),
  iniciarConsulta: (citaId: number) => api.post(`${BASE}/citas/${citaId}/iniciar-consulta`).then(d),

  // Sala de espera
  getSalaEspera: (params?: { fecha?: string; medicoId?: number }) =>
    api.get(`${BASE}/sala-espera`, { params }).then(d),
  registrarLlegada: (data: any) => api.post(`${BASE}/sala-espera`, data).then(d),
  llamarPaciente: (id: number) => api.patch(`${BASE}/sala-espera/${id}/llamar`).then(d),
  marcarAtendido: (id: number) => api.patch(`${BASE}/sala-espera/${id}/atendido`).then(d),

  // Consultas
  listarConsultas: (params?: { page?: number; limit?: number; pacienteId?: number; medicoId?: number }) =>
    api.get(`${BASE}/consultas`, { params }).then(d),
  crearConsulta: (data: any) => api.post(`${BASE}/consultas`, data).then(d),
  obtenerConsulta: (id: number) => api.get(`${BASE}/consultas/${id}`).then(d),
  actualizarConsulta: (id: number, data: any) => api.patch(`${BASE}/consultas/${id}`, data).then(d),
  registrarSignos: (consultaId: number, data: any) => api.post(`${BASE}/consultas/${consultaId}/signos`, data).then(d),

  // Recetas
  listarRecetas: (params?: { page?: number; limit?: number; pacienteId?: number }) =>
    api.get(`${BASE}/recetas`, { params }).then(d),
  crearReceta: (data: any) => api.post(`${BASE}/recetas`, data).then(d),
  obtenerReceta: (id: number) => api.get(`${BASE}/recetas/${id}`).then(d),
  recetaPdf: (id: number) => api.get(`${BASE}/recetas/${id}/pdf`, { responseType: 'blob' }).then(d),

  // Laboratorio
  listarOrdenes: (params?: { page?: number; limit?: number; pacienteId?: number; estado?: string }) =>
    api.get(`${BASE}/laboratorio`, { params }).then(d),
  crearOrden: (data: any) => api.post(`${BASE}/laboratorio`, data).then(d),
  obtenerOrden: (id: number) => api.get(`${BASE}/laboratorio/${id}`).then(d),
  actualizarOrden: (id: number, data: any) => api.patch(`${BASE}/laboratorio/${id}`, data).then(d),
  registrarResultados: (id: number, examenes: any[]) => api.post(`${BASE}/laboratorio/${id}/resultados`, { examenes }).then(d),
  ordenPdf: (id: number) => api.get(`${BASE}/laboratorio/${id}/pdf`, { responseType: 'blob' }).then(d),

  // Procedimientos
  listarProcedimientos: (params?: { page?: number; limit?: number; estado?: string }) =>
    api.get(`${BASE}/procedimientos`, { params }).then(d),
  crearProcedimiento: (data: any) => api.post(`${BASE}/procedimientos`, data).then(d),
  actualizarProcedimiento: (id: number, data: any) => api.patch(`${BASE}/procedimientos/${id}`, data).then(d),
  facturarProcedimiento: (id: number, data: any) => api.post(`${BASE}/procedimientos/${id}/facturar`, data).then(d),

  // ARS
  listarArs: (params?: { page?: number; limit?: number; estado?: string }) =>
    api.get(`${BASE}/ars`, { params }).then(d),
  crearArs: (data: any) => api.post(`${BASE}/ars`, data).then(d),
  actualizarArs: (id: number, data: any) => api.patch(`${BASE}/ars/${id}`, data).then(d),

  // Catálogo
  listarCatalogo: (params?: { especialidad?: string }) =>
    api.get(`${BASE}/catalogo`, { params }).then(d),
  crearCatalogo: (data: any) => api.post(`${BASE}/catalogo`, data).then(d),
  actualizarCatalogo: (id: number, data: any) => api.patch(`${BASE}/catalogo/${id}`, data).then(d),

  // Reportes
  reportes: (tipo: string, params?: { desde?: string; hasta?: string }) =>
    api.get(`${BASE}/reportes`, { params: { tipo, ...params } }).then(d),
};
