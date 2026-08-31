/**
 * El enlace para verificar un e-CF ante la DGII.
 *
 * ── No se construye: se lee ─────────────────────────────────────────────────
 *
 * La URL la devuelve MSeller en la respuesta de la emisión (`qr_url`) y se
 * guarda en `ecf.qrUrl`. Es la MISMA que se imprime en el QR del ticket, que sí
 * funciona.
 *
 * Durante mucho tiempo hubo, además, siete sitios que la armaban a mano así:
 *
 *   https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=…&eNCF=…
 *
 * y esa dirección no resuelve la consulta. La de verdad es otra cosa:
 *
 *   https://fc.dgii.gov.do/ecf/consultatimbrefc
 *     ?rncemisor=…&encf=…&montototal=…&codigoseguridad=…
 *
 * Otro host, otra ruta, y dos parámetros que la versión a mano no ponía. Peor
 * aún, la ruta depende del ambiente —`/ecf/` en producción y `/testecf/` en
 * pruebas—, un dato que quien arma la URL no tiene delante. Cualquier intento
 * de derivarla vuelve a estar mal en cuanto la DGII cambie algo.
 *
 * ── Y si no está, no se enseña ──────────────────────────────────────────────
 *
 * Devuelve null cuando no hay URL guardada. Un enlace de verificación que no
 * verifica es peor que no ofrecer ninguno: el cliente lo abre, no encuentra su
 * comprobante y concluye que la factura no está declarada.
 *
 * Al 2026-08-30 hay URL en 14.109 de 14.111 e-CF (14.064 de 14.065 aceptados),
 * así que el caso sin URL es residual.
 */
export function urlVerificacionDgii(
  ecf?: { qrUrl?: string | null } | null,
): string | null {
  const url = ecf?.qrUrl?.trim();
  return url ? url : null;
}
