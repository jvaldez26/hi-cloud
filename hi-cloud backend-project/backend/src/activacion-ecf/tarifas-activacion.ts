/**
 * Tarifas de implementación de la facturación electrónica.
 *
 * FUENTE ÚNICA. El frontend NO las conoce: las pide a la API y pinta lo que le
 * llegue. Cuando cambie el precio, se cambia aquí y en ningún otro sitio.
 *
 * Pago ÚNICO, sin ITBIS.
 */

/**
 * Sube al cambiar un precio. Se guarda en cada solicitud para saber con qué
 * tarifa se cotizó, sin tener que deducirlo por la fecha.
 *
 * Mismo criterio que `formulaVersion` en los cierres de caja: el registro tiene
 * que ser auto-descriptivo.
 */
export const TARIFA_ACTIVACION_VERSION = 1;

/** Sin certificado digital: hay que gestionarlo, y eso es trabajo extra. */
export const PRECIO_SIN_CERTIFICADO = 18000;

/** Con certificado digital ya en mano. */
export const PRECIO_CON_CERTIFICADO = 15000;

export interface TarifasActivacion {
  version: number;
  moneda: 'DOP';
  aplicaItbis: false;
  sinCertificado: number;
  conCertificado: number;
}

export function tarifasVigentes(): TarifasActivacion {
  return {
    version:        TARIFA_ACTIVACION_VERSION,
    moneda:         'DOP',
    aplicaItbis:    false,
    sinCertificado: PRECIO_SIN_CERTIFICADO,
    conCertificado: PRECIO_CON_CERTIFICADO,
  };
}

/**
 * Precio que corresponde. Un certificado VENCIDO no cuenta como certificado:
 * el archivo es válido pero no sirve para facturar, así que hay que gestionar
 * uno nuevo igual que si no lo tuviera.
 */
export function precioPara(tieneCertificadoValido: boolean): number {
  return tieneCertificadoValido ? PRECIO_CON_CERTIFICADO : PRECIO_SIN_CERTIFICADO;
}
