/**
 * Qué hacer cuando `PATCH /facturas/:id/emitir-pos` falla SIN respuesta del
 * servidor (timeout/red del lado del cliente) — nunca reenviar esa misma
 * petición: el servidor puede seguir procesándola de verdad (la causa real
 * de Sentry #7779557844, EcfDuplicadoError por una venta en curso). El
 * siguiente paso es CONSULTAR el estado real de la factura/e-CF, nunca
 * reintentar el envío ni mostrarle al cajero el mensaje crudo de axios.
 */

/** true solo si la petición NUNCA llegó a tener respuesta del servidor
 *  (timeout del cliente o red caída) — un 4xx/5xx real devuelve `.response`
 *  y no cuenta como esto: ese es un fallo de negocio, no de transporte. */
export function esTimeoutOReddCliente(err: any): boolean {
  if (err?.response) return false;
  const code = err?.code;
  const msg  = String(err?.message ?? '');
  return code === 'ECONNABORTED' || code === 'ERR_NETWORK' || /timeout|network error/i.test(msg);
}

export interface EstadoFacturaConsultada {
  estado?: string;  // FacturaEstado: borrador/emitida/pagada/cancelada
  ecf?: { estadoDGII?: string; numero?: string; qrUrl?: string; trackId?: string; codigoSeguridad?: string } | null;
}

export type ResultadoConsultaTrasTimeout =
  | { tipo: 'confirmada'; mensaje: string; estadoEcf: string }
  | { tipo: 'sin_confirmar'; mensaje: string };

/**
 * Traduce lo que devolvió GET /facturas/:id (tras un timeout de emitir-pos)
 * a un resultado claro para el cajero. `null`/factura todavía en BORRADOR =
 * no se pudo confirmar nada todavía (la petición original puede seguir en
 * vuelo, o de verdad no llegó) — nunca se interpreta como fallo definitivo.
 */
export function interpretarConsultaTrasTimeout(f: EstadoFacturaConsultada | null): ResultadoConsultaTrasTimeout {
  if (!f?.estado || f.estado === 'borrador') {
    return {
      tipo: 'sin_confirmar',
      mensaje: 'No pudimos confirmar si el comprobante fiscal se emitió. Verifica el panel de Facturas en un momento antes de reintentar — la venta puede seguir procesándose.',
    };
  }
  const estadoEcf = f.ecf?.estadoDGII ?? 'pendiente_envio';
  if (estadoEcf === 'aceptado') {
    return { tipo: 'confirmada', mensaje: 'Factura emitida — e-CF aceptado por la DGII.', estadoEcf };
  }
  return { tipo: 'confirmada', mensaje: 'Factura emitida — DGII procesando el comprobante fiscal.', estadoEcf };
}
