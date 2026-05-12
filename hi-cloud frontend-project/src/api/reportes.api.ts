import api from './client';

export const reportesApi = {
  kpis: () =>
    api.get('/reportes/kpis').then(r => r.data.data),

  dashboard: () =>
    api.get('/reportes/dashboard').then(r => r.data.data),

  ventasPorDia: (mes: number, anio: number) =>
    api.get(`/reportes/ventas/por-dia?mes=${mes}&anio=${anio}`).then(r => r.data.data),

  ventasPorPeriodo: (desde: string, hasta: string) =>
    api.get(`/reportes/ventas?fechaDesde=${desde}&fechaHasta=${hasta}`).then(r => r.data.data),

  stockActual: () =>
    api.get('/reportes/inventario/stock').then(r => r.data.data),

  itbis: (mes: number, anio: number) =>
    api.get(`/reportes/fiscal/itbis?mes=${mes}&anio=${anio}`).then(r => r.data.data),

  topClientes: (desde: string, hasta: string, limite = 10) =>
    api.get(`/reportes/ventas/por-cliente?fechaDesde=${desde}&fechaHasta=${hasta}&limite=${limite}`).then(r => r.data.data),

  topProductos: (desde: string, hasta: string, limite = 10) =>
    api.get(`/reportes/ventas/por-producto?fechaDesde=${desde}&fechaHasta=${hasta}&limite=${limite}`).then(r => r.data.data),

  facturasPendientes: () =>
    api.get('/reportes/facturas-pendientes').then(r => r.data.data),

  stockBajoDetalle: () =>
    api.get('/reportes/inventario/stock-bajo').then(r => r.data.data),

  valorInventario: () =>
    api.get('/reportes/inventario/valor').then(r => r.data.data),
};
