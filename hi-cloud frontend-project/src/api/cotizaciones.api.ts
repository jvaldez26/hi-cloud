import api from './client';

export interface CotizacionDetallePayload {
  productoId?: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva?: number;
  // Descuento por línea — mismo contrato que la factura, para que el total no
  // cambie al convertir. Convención A (formulario): precioUnitario es BRUTO y
  // descuentoMonto es el descuento TOTAL de la línea. Convención B (POS):
  // precioOriginal presente, precioUnitario ya NETO, descuentoMonto POR UNIDAD.
  descuentoPct?:    number;
  descuentoMonto?:  number;
  precioOriginal?:  number;
}

export interface CotizacionPayload {
  clienteId:       number;
  fecha:           string;
  validezDias?:    number;
  detalles:        CotizacionDetallePayload[];
  condicionesPago?: string;
  notas?:          string;
  vendedorId?:     number;
  nombreVendedor?: string;
  /** 'monto' = RD$ sobre el subtotal | 'porcentaje' = % sobre el subtotal */
  descuentoGeneralTipo?:  'monto' | 'porcentaje';
  /** Importe en BASE imponible, o el porcentaje */
  descuentoGeneralValor?: number;
  /** Importe pactado c/ITBIS — solo se imprime */
  descuentoGeneralFinal?: number;
}

export const cotizacionesApi = {
  list: (p = 1, limit = 10, search = '') =>
    api.get(`/cotizaciones?page=${p}&limit=${limit}&search=${search}`).then(r => r.data.data),

  getOne: (id: number) =>
    api.get(`/cotizaciones/${id}`).then(r => r.data.data),

  create: (body: CotizacionPayload) =>
    api.post('/cotizaciones', body).then(r => r.data.data),

  cambiarEstado: (id: number, estado: string) =>
    api.patch(`/cotizaciones/${id}/estado`, { estado }).then(r => r.data.data),

  convertir: (id: number) =>
    api.post(`/cotizaciones/${id}/convertir`).then(r => r.data.data),

  duplicar: (id: number) =>
    api.post(`/cotizaciones/${id}/duplicar`).then(r => r.data.data ?? r.data),

  remove: (id: number) =>
    api.delete(`/cotizaciones/${id}`).then(r => r.data),

  resumen: () =>
    api.get('/cotizaciones/resumen').then(r => r.data.data),

  pdf: async (id: number, numero: string) => {
    // JWT en httpOnly cookie — credentials: 'include' la envía automáticamente
    const res = await fetch(`/api/v1/cotizaciones/${id}/pdf`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${numero}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
  },
};
