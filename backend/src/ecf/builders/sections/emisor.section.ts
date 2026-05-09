// Orden FIJO según XSD DGII — NUNCA reordenar estas líneas
const EMISOR_ORDER = [
  'RNCEmisor',
  'RazonSocialEmisor',
  'NombreComercial',     // opcional
  'Sucursal',            // opcional
  'DireccionEmisor',
  'Municipio',           // opcional
  'Provincia',           // opcional
  'Telefono',            // opcional
  'CorreoEmisor',        // opcional
  'ActividadEconomica',  // opcional
  'FechaEmision',        // SIEMPRE AL FINAL
] as const;

type EmisorKey = (typeof EMISOR_ORDER)[number];

/** Datos del emisor normalizados — independiente de la entidad de BD. */
export interface EmpresaConfig {
  rnc:                string;
  razonSocial:        string;
  nombreComercial?:   string;
  sucursal?:          string;
  direccion:          string;
  municipio?:         string;
  provincia?:         string;
  telefono?:          string;
  correo?:            string;
  actividadEconomica?: string;
}

/**
 * Construye el Emisor garantizando el orden exacto del XSD DGII.
 * Usa `EMISOR_ORDER.reduce()` — el orden es invariante al contenido del objeto `raw`.
 * `extras` permite inyectar campos adicionales sin romper el orden (siempre antes de FechaEmision).
 */
export function buildEmisor(
  empresa: EmpresaConfig,
  fecha:   string,
  extras?: Partial<Record<EmisorKey, unknown>>,
): Record<string, unknown> {
  const raw: Partial<Record<EmisorKey, unknown>> = {
    RNCEmisor:          empresa.rnc,
    RazonSocialEmisor:  empresa.razonSocial,
    NombreComercial:    empresa.nombreComercial  || undefined,
    Sucursal:           empresa.sucursal         || undefined,
    DireccionEmisor:    empresa.direccion,
    Municipio:          empresa.municipio        || undefined,
    Provincia:          empresa.provincia        || undefined,
    Telefono:           empresa.telefono         || undefined,
    CorreoEmisor:       empresa.correo           || undefined,
    ActividadEconomica: empresa.actividadEconomica || undefined,
    ...extras,
    FechaEmision: fecha,   // siempre al final — spread de extras no puede sobreescribirlo
  };

  return EMISOR_ORDER.reduce<Record<string, unknown>>((acc, key) => {
    const v = raw[key];
    if (v !== undefined && v !== null && v !== '') {
      acc[key] = v;
    }
    return acc;
  }, {});
}

/** Guard: lanza si FechaEmision no es el último campo. Llámalo antes de enviar a MSeller. */
export function assertEmisorOrder(emisor: object): void {
  const keys = Object.keys(emisor);
  if (keys[keys.length - 1] !== 'FechaEmision') {
    throw new Error(
      `BUG CRÍTICO — FechaEmision no está al final del Emisor.\n` +
      `Orden actual: ${keys.join(' → ')}`,
    );
  }
}
