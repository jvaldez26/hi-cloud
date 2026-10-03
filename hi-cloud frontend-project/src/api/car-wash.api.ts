import api from './client';

export const carWashApi = {
  getDashboard: () => api.get('/car-wash/dashboard').then(r => r.data?.data ?? r.data),
  // Config (ADMIN)
  getConfig: () => api.get('/car-wash/config').then(r => r.data?.data ?? r.data),
  actualizarConfig: (body: any) => api.patch('/car-wash/config', body).then(r => r.data?.data ?? r.data),

  // Servicios (catálogo)
  getServicios: () => api.get('/car-wash/servicios').then(r => r.data?.data ?? r.data),
  crearServicio: (body: any) => api.post('/car-wash/servicios', body).then(r => r.data?.data ?? r.data),
  actualizarServicio: (id: number, body: any) => api.patch(`/car-wash/servicios/${id}`, body).then(r => r.data?.data ?? r.data),

  // Turnos
  getTablero: () => api.get('/car-wash/turnos/tablero').then(r => r.data?.data ?? r.data),
  getHistorial: (filtros: Record<string, any>) => api.get('/car-wash/turnos', { params: filtros }).then(r => r.data?.data ?? r.data),
  // OJO: a diferencia del resto de endpoints, el payload real aquí puede ser
  // legítimamente `null` (placa nunca vista) — el patrón `r.data?.data ?? r.data`
  // usado en el resto de este archivo falla en ese caso: `null ?? r.data`
  // evalúa el lado derecho y termina devolviendo el sobre { success, data,
  // timestamp } completo en vez de `null`. Causó el crash de Sentry 7769544465
  // ("Cannot read properties of undefined (reading 'servicios')"), porque el
  // objeto-sobre es truthy pero no tiene `ultimoTurno`. El ResponseInterceptor
  // global (main.ts) envuelve TODAS las respuestas, así que `r.data.data` es
  // siempre correcto aquí, sin necesidad de fallback.
  getHistorialPorPlaca: (placa: string) => api.get(`/car-wash/placas/${encodeURIComponent(placa)}/historial`).then(r => r.data.data),
  getTurno: (id: number) => api.get(`/car-wash/turnos/${id}`).then(r => r.data?.data ?? r.data),
  crearTurno: (body: any) => api.post('/car-wash/turnos', body).then(r => r.data?.data ?? r.data),
  editarTurno: (id: number, body: any) => api.patch(`/car-wash/turnos/${id}`, body).then(r => r.data?.data ?? r.data),
  cambiarEstado: (id: number, body: any) => api.patch(`/car-wash/turnos/${id}/estado`, body).then(r => r.data?.data ?? r.data),
  asignarBahia: (id: number, body: any) => api.patch(`/car-wash/turnos/${id}/bahia`, body).then(r => r.data?.data ?? r.data),
  getEstadoCobro: (id: number) => api.get(`/car-wash/turnos/${id}/cobro`).then(r => r.data?.data ?? r.data),
  getDetallesParaCobro: (id: number) => api.get(`/car-wash/turnos/${id}/detalles-cobro`).then(r => r.data?.data ?? r.data),

  // Fotos de daños previos
  subirFotos: (id: number, archivos: File[]) => {
    const fd = new FormData();
    archivos.forEach(f => fd.append('fotos', f));
    return api.post(`/car-wash/turnos/${id}/fotos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data?.data ?? r.data);
  },
  getFotos: (id: number) => api.get(`/car-wash/turnos/${id}/fotos`).then(r => r.data?.data ?? r.data),

  // Lavadores
  getLavadores: (soloActivos = false) => api.get('/car-wash/lavadores', { params: { activos: soloActivos } }).then(r => r.data?.data ?? r.data),
  crearLavador: (body: any) => api.post('/car-wash/lavadores', body).then(r => r.data?.data ?? r.data),
  actualizarLavador: (id: number, body: any) => api.patch(`/car-wash/lavadores/${id}`, body).then(r => r.data?.data ?? r.data),
  asignarLavadores: (turnoId: number, lavadores: Array<{ lavadorId: number; porcentaje: number }>) =>
    api.patch(`/car-wash/turnos/${turnoId}/lavadores`, { lavadores }).then(r => r.data?.data ?? r.data),

  // Comisiones
  getComisionesDeTurno: (turnoId: number) => api.get(`/car-wash/turnos/${turnoId}/comisiones`).then(r => r.data?.data ?? r.data),
  anularComision: (id: number, motivo: string) => api.patch(`/car-wash/comisiones/${id}/anular`, { motivo }).then(r => r.data?.data ?? r.data),

  // Adelantos
  crearAdelanto: (body: any) => api.post('/car-wash/adelantos', body).then(r => r.data?.data ?? r.data),

  // Liquidaciones
  reportePagosLavadores: (desde: string, hasta: string) =>
    api.get('/car-wash/liquidaciones/reporte', { params: { desde, hasta } }).then(r => r.data?.data ?? r.data),
  resumenLiquidacion: (lavadorId: number, desde: string, hasta: string) =>
    api.get('/car-wash/liquidaciones/resumen', { params: { lavadorId, desde, hasta } }).then(r => r.data?.data ?? r.data),
  registrarPagoLavador: (body: any) => api.post('/car-wash/liquidaciones', body).then(r => r.data?.data ?? r.data),
};

/** Público, sin sesión — misma instancia de axios (sin cookie no pasa nada: la ruta no la exige). */
export const carWashPublicoApi = {
  getPorToken: (token: string) => api.get(`/publico/carwash/${token}`).then(r => r.data?.data ?? r.data),
};
