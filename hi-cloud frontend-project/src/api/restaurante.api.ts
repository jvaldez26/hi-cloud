import api from './client';

const d = (r: any) => r.data?.data ?? r.data;

export const restauranteApi = {
  // Dashboard
  dashboard:             ()                              => api.get('/restaurante/dashboard').then(d),

  // Áreas
  listarAreas:           ()                              => api.get('/restaurante/areas').then(d),
  crearArea:             (b: any)                        => api.post('/restaurante/areas', b).then(d),
  actualizarArea:        (id: number, b: any)            => api.patch(`/restaurante/areas/${id}`, b).then(d),

  // Mesas
  mapaMesas:             ()                              => api.get('/restaurante/mesas/mapa').then(d),
  listarMesas:           (p?: any)                       => api.get('/restaurante/mesas', { params: p }).then(d),
  crearMesa:             (b: any)                        => api.post('/restaurante/mesas', b).then(d),
  actualizarMesa:        (id: number, b: any)            => api.patch(`/restaurante/mesas/${id}`, b).then(d),

  // Categorías menú
  listarCategorias:      ()                              => api.get('/restaurante/menu/categorias').then(d),
  crearCategoria:        (b: any)                        => api.post('/restaurante/menu/categorias', b).then(d),
  actualizarCategoria:   (id: number, b: any)            => api.patch(`/restaurante/menu/categorias/${id}`, b).then(d),

  // Menú items
  listarMenu:            (p?: any)                       => api.get('/restaurante/menu', { params: p }).then(d),
  obtenerMenuItem:       (id: number)                    => api.get(`/restaurante/menu/${id}`).then(d),
  crearMenuItem:         (b: any)                        => api.post('/restaurante/menu', b).then(d),
  actualizarMenuItem:    (id: number, b: any)            => api.patch(`/restaurante/menu/${id}`, b).then(d),
  toggleDisponibilidad:  (id: number)                    => api.patch(`/restaurante/menu/${id}/disponibilidad`).then(d),
  listarModificadores:   (menuItemId: number)            => api.get(`/restaurante/menu/${menuItemId}/modificadores`).then(d),
  crearModificador:      (b: any)                        => api.post('/restaurante/menu/modificadores', b).then(d),

  // Reservaciones
  listarReservaciones:   (p?: any)                       => api.get('/restaurante/reservaciones', { params: p }).then(d),
  crearReservacion:      (b: any)                        => api.post('/restaurante/reservaciones', b).then(d),
  actualizarReservacion: (id: number, b: any)            => api.patch(`/restaurante/reservaciones/${id}`, b).then(d),
  sentarReservacion:     (id: number)                    => api.patch(`/restaurante/reservaciones/${id}/sentar`).then(d),

  // Comandas
  listarComandas:        (p?: any)                       => api.get('/restaurante/comandas', { params: p }).then(d),
  obtenerComanda:        (id: number)                    => api.get(`/restaurante/comandas/${id}`).then(d),
  abrirComanda:          (b: any)                        => api.post('/restaurante/comandas', b).then(d),
  agregarItem:           (id: number, b: any)            => api.post(`/restaurante/comandas/${id}/items`, b).then(d),
  actualizarItem:        (id: number, itemId: number, b: any) => api.patch(`/restaurante/comandas/${id}/items/${itemId}`, b).then(d),
  cancelarItem:          (id: number, itemId: number, b: any) => api.delete(`/restaurante/comandas/${id}/items/${itemId}`, { data: b }).then(d),
  enviarACocina:         (id: number)                    => api.post(`/restaurante/comandas/${id}/enviar-cocina`).then(d),
  cobrarComanda:         (id: number, b: any)            => api.post(`/restaurante/comandas/${id}/cobrar`, b).then(d),
  dividirCuenta:         (id: number, b: any)            => api.post(`/restaurante/comandas/${id}/dividir`, b).then(d),
  pdfPreCuenta:          (id: number)                    => `${api.defaults.baseURL}/restaurante/comandas/${id}/pdf`,
  pdfTicketCocina:       (id: number)                    => `${api.defaults.baseURL}/restaurante/comandas/${id}/ticket-cocina`,

  // KDS
  kdsItemsPendientes:    ()                              => api.get('/restaurante/kds/pendientes').then(d),
  kdsIniciarItem:        (id: number)                    => api.patch(`/restaurante/kds/items/${id}/iniciar`).then(d),
  kdsMarcarListo:        (id: number)                    => api.patch(`/restaurante/kds/items/${id}/listo`).then(d),
  listarEstaciones:      ()                              => api.get('/restaurante/kds/estaciones').then(d),
  crearEstacion:         (b: any)                        => api.post('/restaurante/kds/estaciones', b).then(d),

  // Delivery
  listarDelivery:        (p?: any)                       => api.get('/restaurante/delivery', { params: p }).then(d),
  crearDelivery:         (b: any)                        => api.post('/restaurante/delivery', b).then(d),
  actualizarEstadoDelivery: (id: number, estado: string) => api.patch(`/restaurante/delivery/${id}/estado`, { estado }).then(d),
  asignarRepartidor:     (id: number, b: any)            => api.post(`/restaurante/delivery/${id}/asignar-repartidor`, b).then(d),

  // Turnos
  listarTurnos:          (p?: any)                       => api.get('/restaurante/turnos', { params: p }).then(d),
  abrirTurno:            (b: any)                        => api.post('/restaurante/turnos/abrir', b).then(d),
  cerrarTurno:           (id: number, b: any)            => api.patch(`/restaurante/turnos/${id}/cerrar`, b).then(d),
  resumenTurno:          (id: number)                    => api.get(`/restaurante/turnos/${id}/resumen`).then(d),
  pdfTurno:              (id: number)                    => `${api.defaults.baseURL}/restaurante/turnos/${id}/pdf`,

  // Reportes
  reporteVentas:         (p: any)                        => api.get('/restaurante/reportes/ventas', { params: p }).then(d),
};
