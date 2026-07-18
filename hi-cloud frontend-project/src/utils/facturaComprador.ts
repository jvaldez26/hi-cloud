/**
 * Fuente canónica del comprador en facturas:
 *   ecf.razonSocialComprador → cliente.nombre → "Consumidor Final"
 *
 * No realiza lookups externos — usa solo lo que ya viene en el objeto factura.
 * Misma cascada que usa el PDF A4 en el backend (pdf.service.ts buildFacturaData).
 */

export function resolverNombreComprador(f: any): string {
  return f?.ecf?.razonSocialComprador
    || f?.cliente?.nombre
    || 'Consumidor Final';
}

/**
 * Fuente canónica del RNC/cédula del comprador:
 *   ecf.rncComprador → factura.rncComprador → cliente.rncReceptor → cliente.rfc
 */
export function resolverRncComprador(f: any): string | undefined {
  return f?.ecf?.rncComprador
    || f?.rncComprador
    || f?.cliente?.rncReceptor
    || f?.cliente?.rfc
    || undefined;
}
