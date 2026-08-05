import { Logger } from '@nestjs/common';

const compradorLogger = new Logger('ECFComprador');

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
  encf = '',
): Record<string, unknown> {
  const rncLimpio = rnc.replace(/\D/g, '');
  if (rncLimpio.length !== 9 && rncLimpio.length !== 11) {
    compradorLogger.warn(
      `[${encf || 'sin-encf'}] RNCComprador con formato inválido: "${rnc}" ` +
      `(${rncLimpio.length} dígitos; esperado 9=RNC o 11=cédula). ` +
      `Razón social: "${razonSocial.trim()}". Revisar datos del cliente.`,
    );
  }
  return {
    RNCComprador:         rncLimpio || rnc,
    RazonSocialComprador: razonSocial.trim(),
    ...(extras ?? {}),
  };
}

/**
 * Comprador extranjero — E46 (Exportaciones) y E47 (Pagos al Exterior).
 *
 * CASO A — Cliente extranjero (exportación estándar):
 *   IdentificadorExtranjero + RazonSocialComprador + PaisComprador
 *
 * CASO B — Zona Franca / residente RD con régimen especial:
 *   RNCComprador + RazonSocialComprador + PaisComprador
 */
export function buildCompradorExtranjero(
  nombre:                  string,
  paisISO:                 string,   // código ISO 2 letras: 'US', 'MX', 'ES'…
  identificadorExtranjero?: string,  // ID fiscal del cliente en su país
  rncComprador?:            string,  // RNC si es Zona Franca (residente RD)
): Record<string, unknown> {
  const comp: Record<string, unknown> = {};
  if (rncComprador) {
    comp['RNCComprador'] = rncComprador;
  } else if (identificadorExtranjero) {
    comp['IdentificadorExtranjero'] = identificadorExtranjero;
  }
  comp['RazonSocialComprador'] = nombre.trim();
  comp['PaisComprador']        = paisISO;
  return comp;
}
