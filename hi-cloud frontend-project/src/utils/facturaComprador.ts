/**
 * Fuente canónica del comprador en facturas.
 *
 * Manda el snapshot fiscal de la factura (`rncComprador` /
 * `razonSocialComprador`): se congela al emitir el e-CF, desde el mismo payload
 * que se le mandó a la DGII, y no cambia aunque el cliente vinculado cambie
 * después. Ver el comentario en factura.entity.ts del backend.
 *
 * Detrás va el e-CF, para las facturas que el backfill no alcanzó. El cliente
 * vinculado es el último recurso y solo debería aplicar a documentos NO
 * fiscales — caer al cliente en uno fiscal es lo que hacía que las vistas
 * dijeran "Consumidor Final" mientras la DGII tenía el comprador real.
 *
 * No realiza lookups externos — usa solo lo que ya viene en el objeto factura.
 * Misma cascada que el PDF A4 y el recibo térmico en el backend (pdf.service).
 */

export function resolverNombreComprador(f: any): string {
  return f?.razonSocialComprador
    || f?.ecf?.razonSocialComprador
    || f?.cliente?.nombre
    || 'Consumidor Final';
}

/** Misma jerarquía para el RNC/cédula del comprador. */
export function resolverRncComprador(f: any): string | undefined {
  return f?.rncComprador
    || f?.ecf?.rncComprador
    || f?.cliente?.rncReceptor
    || f?.cliente?.rfc
    || undefined;
}
