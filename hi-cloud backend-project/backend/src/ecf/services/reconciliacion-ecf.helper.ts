import { EstadoDGII } from '../entities/ecf.entity';
import { MSellerClientService } from './mseller-client.service';

/**
 * Mapeo canónico status MSeller → EstadoDGII (idéntico al de
 * consultar-estado-ecf.job y ecf-webhook.controller).
 * Los estados en tránsito (PROCESANDO/RECIBIDO/ENVIADO/EN PROCESO) mapean a
 * ENVIADO: NO son veredicto final; el consultar-estado-ecf.job (cada 2 min,
 * recoge los ENVIADO) seguirá consultando hasta aceptado/observado/rechazado.
 */
const MSELLER_ESTADO_MAP: Record<string, EstadoDGII> = {
  'ACEPTADO':             EstadoDGII.ACEPTADO,
  'RECHAZADO':            EstadoDGII.RECHAZADO,
  'OBSERVADO':            EstadoDGII.OBSERVADO,
  'ACEPTADO CONDICIONAL': EstadoDGII.OBSERVADO,
  'PROCESANDO':           EstadoDGII.ENVIADO,
  'RECIBIDO':             EstadoDGII.ENVIADO,
  'ENVIADO':              EstadoDGII.ENVIADO,
  'EN PROCESO':           EstadoDGII.ENVIADO,
};

/**
 * Detecta el rechazo de MSeller "el eNCF ya existe en el sistema" (que NO es un
 * rechazo real: significa que un envío previo sí llegó y fue procesado).
 *
 * ⚠️ DEPENDE DEL WORDING DE MSELLER. Mensaje observado (2026-07):
 *   "El documento con eNCF <X> ya existe en el sistema. No se puede procesar
 *    el mismo eNCF nuevamente."
 * MSeller NO expone un código específico para este caso — solo el texto del 400.
 * Si MSeller cambia el mensaje (o añade un código), ACTUALIZAR aquí.
 * Se busca case-insensitive tanto en `message` como en `detalle`.
 */
export function esErrorYaExiste(err: unknown): boolean {
  const e = err as { message?: string; detalle?: string };
  const txt = [e?.message, e?.detalle].filter(Boolean).join(' ').toLowerCase();
  return txt.includes('ya existe en el sistema') || txt.includes('ya existe');
}

export type ResultadoConsultaEncf =
  | { tipo: 'existe';      estado: EstadoDGII }  // MSeller lo tiene → adoptar, NO reenviar
  | { tipo: 'no_existe' }                        // MSeller NO lo tiene → reenviar
  | { tipo: 'desconocido' };                     // consulta no concluyente → fail-safe (PENDIENTE)

/**
 * Consulta en MSeller si un eNCF ya fue procesado. Funciona por eNCF (sin
 * trackId), vía consultarBatch. Fail-safe: ante cualquier ambigüedad (consulta
 * caída, eNCF no devuelto, status no mapeable) devuelve 'desconocido' — nunca
 * decide un estado fiscal en firme sin confirmación de MSeller.
 */
export async function consultarExistenciaEncf(
  mseller:   MSellerClientService,
  numero:    string,
  empresaId: number,
): Promise<ResultadoConsultaEncf> {
  let resp;
  try {
    resp = await mseller.consultarBatch([numero], empresaId);
  } catch {
    return { tipo: 'desconocido' };                 // la consulta falló → no decidir
  }
  const item = resp.results?.find(r => r.ecf === numero);
  if (!item) return { tipo: 'desconocido' };         // el proveedor no devolvió el eNCF → no decidir
  if (!item.found) return { tipo: 'no_existe' };     // confirmado que NO llegó → reenviar
  const estado = MSELLER_ESTADO_MAP[(item.status ?? '').toUpperCase()];
  if (!estado) {
    // Existe allá (found:true) pero el status no es mapeable. NO reenviar: hay un
    // comprobante del otro lado y reenviar arriesgaría un duplicado. Se adopta como
    // ENVIADO para que el consultar-estado-ecf.job lo siga hasta un veredicto final.
    return { tipo: 'existe', estado: EstadoDGII.ENVIADO };
  }
  return { tipo: 'existe', estado };
}

/**
 * Decisión ÚNICA "adoptar vs reenviar vs dejar" para un e-CF que YA existe en un
 * registro local. La comparten procesarUno (cron/reenvío manual/botón "Emitir")
 * y cualquier flujo que reconcilie. PRINCIPIO: si ya hay un eNCF, jamás se genera
 * uno nuevo; a lo sumo se reenvía el mismo.
 */
export type DecisionReconciliacion =
  | { accion: 'adoptar';         estado: EstadoDGII }  // ACEPTADO/OBSERVADO/ENVIADO → adoptar el estado real
  | { accion: 'reenviar' }                              // no_existe → reenviar EL MISMO eNCF (sin número nuevo)
  | { accion: 'dejar_rechazado' }                       // rechazado por DGII → dejar así (corrección manual)
  | { accion: 'esperar' };                              // consulta no concluyente → fail-safe, no tocar

export async function decidirReconciliacionEcf(
  mseller:   MSellerClientService,
  numero:    string,
  empresaId: number,
): Promise<DecisionReconciliacion> {
  const r = await consultarExistenciaEncf(mseller, numero, empresaId);
  if (r.tipo === 'desconocido') return { accion: 'esperar' };
  if (r.tipo === 'no_existe')   return { accion: 'reenviar' };
  if (r.estado === EstadoDGII.RECHAZADO) return { accion: 'dejar_rechazado' };
  return { accion: 'adoptar', estado: r.estado };       // ACEPTADO / OBSERVADO / ENVIADO
}
