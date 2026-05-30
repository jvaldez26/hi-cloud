/** RNC genérico DGII para gastos menores (E43) */
export const COMPRADOR_GASTOS_MENORES = {
  RNCComprador:         '131880657',
  RazonSocialComprador: 'CLIENTES DE LA ADMINISTRACION',
} as const;

/** Comprador consumidor final genérico (E32 sin RNC identificado) */
export const COMPRADOR_CONSUMIDOR_FINAL = {
  RNCComprador:         '00000000000',
  RazonSocialComprador: 'Consumidor Final',
} as const;

/** Comprador con RNC identificado — E31, E32 con RNC, E33, E34, E41, E44, E45 */
export function buildCompradorRNC(
  rnc:         string,
  razonSocial: string,
  extras?:     Record<string, unknown>,
): Record<string, unknown> {
  return {
    RNCComprador:         rnc,
    RazonSocialComprador: razonSocial,
    ...(extras ?? {}),
  };
}

/** Comprador extranjero — E46 (Exportaciones) y E47 (Pagos al Exterior).
 *  XSD DGII: RazonSocialComprador (obligatorio) + PaisComprador (código ISO 2). */
export function buildCompradorExtranjero(
  nombre:  string,
  paisISO: string,   // código ISO 2 letras: 'US', 'MX', 'ES', 'PR'...
): Record<string, unknown> {
  return {
    RazonSocialComprador: nombre,
    PaisComprador:        paisISO,   // XSD: PaisComprador (no PaisCompradorExtranjero)
  };
}
