export function fmtFecha(d: Date | string | undefined): string {
  const dt = !d ? new Date() : d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
}

export function addDias(d: Date | string, dias: number): string {
  const dt = d instanceof Date ? new Date(d) : new Date(d);
  dt.setDate(dt.getDate() + dias);
  return fmtFecha(dt);
}

export interface TablaFormasPagoEntry {
  FormaPago:  number;
  MontoPago:  string;
}

export interface IdDocInput {
  tipo:                     number;
  encf:                     string;
  fechaVencSec?:            Date;                          // omitir en E32
  indicadorNotaCredito?:    '0' | '1';                     // E34: '0'=dentro 30d, '1'=después 30d
  indicadorEnvioDiferido?:  0 | 1;
  indicadorMontoGravado?:   0 | 1;
  tipoIngresos?:            string;                        // '01'; omitir en E41, E47
  tipoPago?:                number;
  fechaLimitePago?:         string;                        // DD-MM-YYYY; solo TipoPago=2
  tablaFormasPago?:         { FormaDePago: TablaFormasPagoEntry[] };  // E33
}

/**
 * Construye IdDoc con el orden exacto del XSD DGII.
 * Las propiedades se añaden secuencialmente para garantizar el orden.
 */
export function buildIdDoc(input: IdDocInput): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  doc['TipoeCF'] = input.tipo;
  doc['eNCF']    = input.encf;
  if (input.fechaVencSec !== undefined)         doc['FechaVencimientoSecuencia'] = fmtFecha(input.fechaVencSec);
  if (input.indicadorNotaCredito !== undefined)  doc['IndicadorNotaCredito']      = input.indicadorNotaCredito;
  if (input.indicadorEnvioDiferido !== undefined) doc['IndicadorEnvioDiferido']   = input.indicadorEnvioDiferido;
  if (input.indicadorMontoGravado !== undefined)  doc['IndicadorMontoGravado']    = input.indicadorMontoGravado;
  if (input.tipoIngresos)                        doc['TipoIngresos']              = input.tipoIngresos;
  if (input.tipoPago !== undefined)              doc['TipoPago']                  = input.tipoPago;
  if (input.fechaLimitePago)                     doc['FechaLimitePago']           = input.fechaLimitePago;
  if (input.tablaFormasPago)                     doc['TablaFormasPago']           = input.tablaFormasPago;
  return doc;
}
