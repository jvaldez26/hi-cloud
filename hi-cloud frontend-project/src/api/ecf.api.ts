import api from './client';

export const ecfApi = {
  tipos: () =>
    api.get('/ecf/tipos').then(r => r.data.data),

  // Secuencias
  secuencias: (p = 1, limit = 10) =>
    api.get(`/ecf/secuencias?page=${p}&limit=${limit}`).then(r => r.data.data),

  createSecuencia: (body: { tipoECFId: number; secuenciaInicial: number; secuenciaFinal: number; fechaVencimiento: string }) =>
    api.post('/ecf/secuencias', body).then(r => r.data.data),

  updateSecuencia: (id: number, body: { secuenciaInicial?: number; secuenciaFinal?: number; fechaVencimiento?: string }) =>
    api.patch(`/ecf/secuencias/${id}`, body).then(r => r.data.data),

  desactivarSecuencia: (id: number) =>
    api.patch(`/ecf/secuencias/${id}/desactivar`).then(r => r.data.data),

  secuenciasProximasVencer: () =>
    api.get('/ecf/secuencias/proximas-vencer').then(r => r.data.data),

  // e-CFs
  list: (p = 1, limit = 10, estado?: string, tipo?: string, search?: string) =>
    api.get(`/ecf?page=${p}&limit=${limit}${estado ? `&estado=${estado}` : ''}${tipo ? `&tipo=${tipo}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(r => r.data.data),

  pendientes: () =>
    api.get('/ecf/pendientes').then(r => r.data.data),

  rechazados: () =>
    api.get('/ecf/rechazados').then(r => r.data.data),

  getByNumero: (numero: string) =>
    api.get(`/ecf/${numero}`).then(r => r.data.data),

  /** e-CF de una factura específica */
  getEcfByFactura: (facturaId: number) =>
    api.get(`/ecf?facturaId=${facturaId}&limit=1`).then(r => {
      const d = r.data?.data ?? r.data;
      return (d?.data ?? d)?.[0] ?? null;
    }),

  /** e-CF de cualquier documento origen (compra, gasto, nota, etc.)
   *  Pasar documentoOrigenTipo evita colisión cuando factura y compra tienen el mismo ID */
  getEcfByDocumento: (documentoOrigenId: number, documentoOrigenTipo?: string) => {
    const params: Record<string, any> = { documentoOrigenId, limit: 1 };
    if (documentoOrigenTipo) params.documentoOrigenTipo = documentoOrigenTipo;
    return api.get('/ecf', { params }).then(r => {
      const d = r.data?.data ?? r.data;
      return (d?.data ?? d)?.[0] ?? null;
    });
  },

  getXml: (numero: string) =>
    api.get(`/ecf/${numero}/xml`).then(r => r.data.data),

  reenviar: (numero: string) =>
    api.post(`/ecf/${numero}/reenviar`).then(r => r.data.data),

  /** Fuerza consulta inmediata de estados a MSeller para todos los e-CFs enviados */
  consultarEstados: () =>
    api.post('/ecf/consultar-estados').then(r => r.data),

  actualizarEstado: (numero: string, body: { estadoDGII: string; xmlRespuesta?: string }) =>
    api.patch(`/ecf/${numero}/estado`, body).then(r => r.data.data),

  // Proveedor
  getProveedor: () =>
    api.get('/ecf/config/proveedor').then(r => r.data.data),

  createProveedor: (body: Record<string, string>) =>
    api.post('/ecf/config/proveedor', body).then(r => r.data.data),

  // E33: Nota de Débito
  emitirEcfNotaDebito: (notaId: number, body?: {
    ncfModificado?: string;
    fechaNcfModificado?: string;
    montoNcfModificado?: number;
    numeroLineaModificada?: number;
  }) =>
    api.post(`/ecf/nota-debito/${notaId}/emitir`, body ?? {}).then(r => r.data.data),

  // E34: Nota de Crédito
  // CodigoModificacion es STRING: "1"=Anulación, "2"=Corrección texto, "3"=Corrección montos,
  // "4"=Reemplazo contingencia, "5"=Referencia a Factura de Consumo
  emitirEcfNotaCredito: (notaId: number, body: {
    codigoModificacion: '1' | '2' | '3' | '4' | '5';
    ncfModificado?: string;
    fechaNcfModificado?: string;
  }) =>
    api.post(`/ecf/nota-credito/${notaId}/emitir`, body).then(r => r.data.data),

  // E41: Comprobante de Compras
  emitirEcfCompra: (compraId: number) =>
    api.post(`/ecf/compra/${compraId}/emitir`, {}).then(r => r.data.data),

  // E43: Gastos Menores
  emitirEcfGasto: (gastoId: number) =>
    api.post(`/ecf/gasto/${gastoId}/emitir`, {}).then(r => r.data.data),

  // E46: Exportaciones (desde factura con tipoNcf=E46)
  // Se emite automáticamente al emitir la factura. Este endpoint es para reenvíos.

  // E47: Pago al Exterior
  emitirEcfPagoExterior: (compraId: number, body: {
    otraMoneda?: { Moneda: string; TipoCambio: number; MontoTotal: number };
    retencionISR?: number;
  }) =>
    api.post(`/ecf/compra/${compraId}/emitir-pago-exterior`, body).then(r => r.data.data),

  // Tipo sugerido según tipo de cliente
  tipoSugerido: (tipoCliente: string) =>
    api.get(`/ecf/tipo-sugerido/${tipoCliente}`).then(r => r.data.data),
};
