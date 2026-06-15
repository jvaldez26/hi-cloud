import api from './client';

export const gimnasioApi = {
  // Miembros
  getMiembros: (params?: any) => api.get('/gimnasio/miembros', { params }).then(r => r.data?.data ?? r.data),
  getMiembro: (id: number) => api.get(`/gimnasio/miembros/${id}`).then(r => r.data?.data ?? r.data),
  crearMiembro: (body: any) => api.post('/gimnasio/miembros', body).then(r => r.data?.data ?? r.data),
  actualizarMiembro: (id: number, body: any) => api.patch(`/gimnasio/miembros/${id}`, body).then(r => r.data?.data ?? r.data),
  getMiembroByQR: (codigo: string) => api.get(`/gimnasio/miembros/qr/${codigo}`).then(r => r.data?.data ?? r.data),
  getMembresiaActiva: (id: number) => api.get(`/gimnasio/miembros/${id}/membresia-activa`).then(r => r.data?.data ?? r.data),
  getHistorialAccesos: (id: number) => api.get(`/gimnasio/miembros/${id}/historial-accesos`).then(r => r.data?.data ?? r.data),
  getClasesReservadas: (id: number) => api.get(`/gimnasio/miembros/${id}/clases-reservadas`).then(r => r.data?.data ?? r.data),
  getProgresoMiembro: (id: number) => api.get(`/gimnasio/miembros/${id}/progreso`).then(r => r.data?.data ?? r.data),
  getRutinaActiva: (id: number) => api.get(`/gimnasio/miembros/${id}/rutina-activa`).then(r => r.data?.data ?? r.data),

  // Planes
  getPlanes: () => api.get('/gimnasio/planes').then(r => r.data?.data ?? r.data),
  crearPlan: (body: any) => api.post('/gimnasio/planes', body).then(r => r.data?.data ?? r.data),
  actualizarPlan: (id: number, body: any) => api.patch(`/gimnasio/planes/${id}`, body).then(r => r.data?.data ?? r.data),

  // Membresías
  getMembresias: (params?: any) => api.get('/gimnasio/membresias', { params }).then(r => r.data?.data ?? r.data),
  getMembresia: (id: number) => api.get(`/gimnasio/membresias/${id}`).then(r => r.data?.data ?? r.data),
  crearMembresia: (body: any) => api.post('/gimnasio/membresias', body).then(r => r.data?.data ?? r.data),
  actualizarMembresia: (id: number, body: any) => api.patch(`/gimnasio/membresias/${id}`, body).then(r => r.data?.data ?? r.data),
  renovarMembresia: (id: number) => api.post(`/gimnasio/membresias/${id}/renovar`).then(r => r.data?.data ?? r.data),
  congelarMembresia: (id: number, body: any) => api.post(`/gimnasio/membresias/${id}/congelar`, body).then(r => r.data?.data ?? r.data),
  descongelarMembresia: (id: number) => api.post(`/gimnasio/membresias/${id}/descongelar`).then(r => r.data?.data ?? r.data),
  getProximasVencer: () => api.get('/gimnasio/membresias/proximas-vencer').then(r => r.data?.data ?? r.data),

  // Clases y Schedule
  getClases: () => api.get('/gimnasio/clases').then(r => r.data?.data ?? r.data),
  crearClase: (body: any) => api.post('/gimnasio/clases', body).then(r => r.data?.data ?? r.data),
  actualizarClase: (id: number, body: any) => api.patch(`/gimnasio/clases/${id}`, body).then(r => r.data?.data ?? r.data),
  getSchedule: (params?: any) => api.get('/gimnasio/schedule', { params }).then(r => r.data?.data ?? r.data),
  crearSchedule: (body: any) => api.post('/gimnasio/schedule', body).then(r => r.data?.data ?? r.data),
  getScheduleHoy: () => api.get('/gimnasio/schedule/hoy').then(r => r.data?.data ?? r.data),
  getAsistentes: (id: number, fecha: string) => api.get(`/gimnasio/schedule/${id}/asistentes`, { params: { fecha } }).then(r => r.data?.data ?? r.data),

  // Reservas
  crearReserva: (body: any) => api.post('/gimnasio/reservas', body).then(r => r.data?.data ?? r.data),
  cancelarReserva: (id: number) => api.delete(`/gimnasio/reservas/${id}`).then(r => r.data?.data ?? r.data),
  registrarAsistencia: (id: number, body: any) => api.patch(`/gimnasio/reservas/${id}/asistencia`, body).then(r => r.data?.data ?? r.data),

  // Entrenadores
  getEntrenadores: () => api.get('/gimnasio/entrenadores').then(r => r.data?.data ?? r.data),
  crearEntrenador: (body: any) => api.post('/gimnasio/entrenadores', body).then(r => r.data?.data ?? r.data),
  actualizarEntrenador: (id: number, body: any) => api.patch(`/gimnasio/entrenadores/${id}`, body).then(r => r.data?.data ?? r.data),
  getAgendaEntrenador: (id: number) => api.get(`/gimnasio/entrenadores/${id}/agenda`).then(r => r.data?.data ?? r.data),

  // Sesiones EP
  getSesionesEP: (params?: any) => api.get('/gimnasio/sesiones-ep', { params }).then(r => r.data?.data ?? r.data),
  crearSesionEP: (body: any) => api.post('/gimnasio/sesiones-ep', body).then(r => r.data?.data ?? r.data),
  actualizarSesionEP: (id: number, body: any) => api.patch(`/gimnasio/sesiones-ep/${id}`, body).then(r => r.data?.data ?? r.data),

  // Rutinas
  getRutinas: (params?: any) => api.get('/gimnasio/rutinas', { params }).then(r => r.data?.data ?? r.data),
  getRutina: (id: number) => api.get(`/gimnasio/rutinas/${id}`).then(r => r.data?.data ?? r.data),
  crearRutina: (body: any) => api.post('/gimnasio/rutinas', body).then(r => r.data?.data ?? r.data),
  actualizarRutina: (id: number, body: any) => api.patch(`/gimnasio/rutinas/${id}`, body).then(r => r.data?.data ?? r.data),
  getRutinaPdf: (id: number) => api.get(`/gimnasio/rutinas/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),

  // Progreso
  getProgreso: (params?: any) => api.get('/gimnasio/progreso', { params }).then(r => r.data?.data ?? r.data),
  crearProgreso: (body: any) => api.post('/gimnasio/progreso', body).then(r => r.data?.data ?? r.data),
  getProgresoGrafica: (miembroId: number) => api.get(`/gimnasio/progreso/${miembroId}/grafica`).then(r => r.data?.data ?? r.data),

  // Accesos
  registrarAcceso: (codigo: string) => api.post('/gimnasio/accesos/registrar', { codigo }).then(r => r.data?.data ?? r.data),
  getAccesosHoy: () => api.get('/gimnasio/accesos/hoy').then(r => r.data?.data ?? r.data),
  getAccesos: (params?: any) => api.get('/gimnasio/accesos', { params }).then(r => r.data?.data ?? r.data),

  // Lockers
  getLockers: (estado?: string) => api.get('/gimnasio/lockers', { params: { estado } }).then(r => r.data?.data ?? r.data),
  asignarLocker: (body: any) => api.post('/gimnasio/lockers/asignar', body).then(r => r.data?.data ?? r.data),
  liberarLocker: (id: number) => api.patch(`/gimnasio/lockers/${id}/liberar`).then(r => r.data?.data ?? r.data),

  // Nutrición
  getNutricion: (params?: any) => api.get('/gimnasio/nutricion', { params }).then(r => r.data?.data ?? r.data),
  crearNutricion: (body: any) => api.post('/gimnasio/nutricion', body).then(r => r.data?.data ?? r.data),
  getNutricionPdf: (id: number) => api.get(`/gimnasio/nutricion/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),

  // Tienda
  getTienda: () => api.get('/gimnasio/tienda').then(r => r.data?.data ?? r.data),
  ventaTienda: (body: any) => api.post('/gimnasio/tienda/venta', body).then(r => r.data?.data ?? r.data),

  // Dashboard
  getDashboard: () => api.get('/gimnasio/dashboard').then(r => r.data?.data ?? r.data),
};
