/**
 * Huella de la acción exacta que se autorizó — solo la llenan los tokens
 * REMOTOS que tuvieron ese dato disponible al pedirla (ver
 * AutorizacionRemotaService.crear). Un token presencial nunca trae huella
 * (todas NULL) y esta validación no hace nada en ese caso.
 *
 * Fail-closed por diseño (pedido explícito: "si el cajero cambia el carrito
 * después de pedir, la autorización queda inválida"): el token YA SE
 * CONSUMIÓ (usado=true) antes de llegar aquí — si la huella no coincide, se
 * rechaza la petición real igual, pero el token NO se "devuelve" (no hay
 * forma de deshacer el UPDATE atómico, y tampoco debería: alguien pidió
 * autorización para una cosa y está a punto de hacer otra distinta, eso es
 * exactamente lo que se quiere bloquear).
 *
 * `monto` compara con tolerancia de 1 centavo — nunca con `===` directo,
 * para no fallar por redondeo de punto flotante entre lo que mostró el POS
 * al pedir y lo que el backend recalculó al llegar la petición real.
 */
export interface HuellaAutorizacion {
  facturaId?: number | null;
  clienteId?: number | null;
  monto?: number | null;
}

export function huellaCoincide(aprobada: HuellaAutorizacion, real: HuellaAutorizacion): boolean {
  if (aprobada.facturaId != null && Number(aprobada.facturaId) !== Number(real.facturaId)) return false;
  if (aprobada.clienteId != null && Number(aprobada.clienteId) !== Number(real.clienteId)) return false;
  if (aprobada.monto != null) {
    const real_ = real.monto != null ? Number(real.monto) : NaN;
    if (!Number.isFinite(real_) || Math.abs(Number(aprobada.monto) - real_) > 0.01) return false;
  }
  return true;
}

/** Extrae la huella "real" de una request genérica — nombres de campo más
 *  comunes entre los DTOs del proyecto, mejor esfuerzo. Ver el comentario en
 *  requiere-supervisor.guard.ts sobre por qué esto es deliberadamente laxo:
 *  si el body no trae ninguno de estos campos, la huella aprobada para ESA
 *  clave tampoco los tendrá (el frontend solo la llena cuando puede), así
 *  que no hay nada que comparar y huellaCoincide() no bloquea nada. */
export function huellaDesdeBody(body: any): HuellaAutorizacion {
  return {
    facturaId: body?.facturaId ?? null,
    clienteId: body?.clienteId ?? null,
    monto:     body?.monto ?? body?.total ?? body?.descuentoMonto ?? body?.precioNuevo ?? null,
  };
}
