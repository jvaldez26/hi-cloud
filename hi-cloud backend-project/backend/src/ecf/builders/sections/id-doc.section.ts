const TZ_RD = 'America/Santo_Domingo';

function rdParts(d: Date): { dd: string; mm: string; yyyy: string } {
  // en-CA siempre produce YYYY-MM-DD — determinístico independientemente del locale del servidor
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_RD, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d).split('-');
  return { yyyy: parts[0], mm: parts[1], dd: parts[2] };
}

export function fmtFecha(d: Date | string | undefined): string {
  const dt = !d ? new Date() : d instanceof Date ? d : new Date(d);
  const { dd, mm, yyyy } = rdParts(dt);
  return `${dd}-${mm}-${yyyy}`;
}

export function addDias(d: Date | string, dias: number): string {
  const dt = d instanceof Date ? new Date(d) : new Date(d);
  const { yyyy, mm, dd } = rdParts(dt);
  // Anclar al mediodía UTC del día RD para que la aritmética no cruce la medianoche RD (UTC-4)
  const base = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 16));
  base.setUTCDate(base.getUTCDate() + dias);
  return fmtFecha(base);
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
