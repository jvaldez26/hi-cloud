export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface DetalleLike {
  porcentajeIva:  number | string;
  subtotal:       number | string;
  importeIva?:    number | string;
  iva?:           number | string;
}

function desgloseDetalles(detalles: DetalleLike[]): {
  gravado18: number; gravado16: number; exento: number;
  itbis18:   number; itbis16:   number;
} {
  let gravado18 = 0, gravado16 = 0, exento = 0, itbis18 = 0, itbis16 = 0;
  for (const d of (detalles ?? [])) {
    const pct = Number(d.porcentajeIva);
    const iva = Number(d.importeIva ?? d.iva ?? 0);
    if      (pct === 18) { gravado18 += Number(d.subtotal); itbis18 += iva; }
    else if (pct === 16) { gravado16 += Number(d.subtotal); itbis16 += iva; }
    else                 { exento    += Number(d.subtotal); }
  }
  return { gravado18, gravado16, exento, itbis18, itbis16 };
}

/**
 * Totales para tipos con ITBIS aplicable: E31, E41, E45.
 * Incluye sección ITBIS solo cuando hay monto gravado > 0.
 */
export function buildTotalesGravados(detalles: DetalleLike[], total: number): Record<string, unknown> {
  const { gravado18, gravado16, exento, itbis18, itbis16 } = desgloseDetalles(detalles);
  const hayI1 = gravado18 > 0;
  const hayI2 = gravado16 > 0;
  // Orden estricto XSD DGII: MontoGravadoXX → MontoExento → ITBISXX → TotalITBISXX → MontoTotal
  const tot: Record<string, unknown> = {};
  if (hayI1 || hayI2) tot['MontoGravadoTotal'] = round2(gravado18 + gravado16);
  if (hayI1)          tot['MontoGravadoI1']    = round2(gravado18);
  if (hayI2)    tot['MontoGravadoI2'] = round2(gravado16);
  if (exento > 0) tot['MontoExento'] = round2(exento);
  if (hayI1) tot['ITBIS1']      = 18;
  if (hayI2) tot['ITBIS2']      = 16;
  if (hayI1 || hayI2) tot['TotalITBIS']  = round2(itbis18 + itbis16);
  if (hayI1) tot['TotalITBIS1'] = round2(itbis18);
  if (hayI2) tot['TotalITBIS2'] = round2(itbis16);
  tot['MontoTotal'] = round2(total);
  return tot;
}

/**
 * Totales mixtos para E32 — puede contener ITBIS y/o monto exento.
 * Mismo cálculo que gravados pero también aplicable cuando todo es exento.
 */
export function buildTotalesMixtos(detalles: DetalleLike[], total: number): Record<string, unknown> {
  return buildTotalesGravados(detalles, total);
}

/**
 * Totales simples para tipos 100% exentos: E33, E34, E43, E44, E46, E47.
 */
export function buildTotalesExentos(total: number): Record<string, unknown> {
  return {
    MontoExento: round2(total),
    MontoTotal:  round2(total),
  };
}

/** Indica si los detalles tienen algún monto gravado (para IndicadorMontoGravado). */
export function tieneMontoGravado(detalles: DetalleLike[]): boolean {
  const { gravado18, gravado16 } = desgloseDetalles(detalles);
  return gravado18 + gravado16 > 0;
}

/**
 * Totales Tasa Cero — E46 (Exportaciones).
 * Las exportaciones NO son exentas: son ITBIS Tasa 0% (IndicadorFacturacion=3).
 * El XSD requiere MontoGravadoI3 (no MontoExento) con ITBIS = 0.
 */
export function buildTotalesTasaCero(total: number): Record<string, unknown> {
  return {
    MontoGravadoTotal: round2(total),
    MontoGravadoI3:    round2(total),   // monto gravado a tasa 0%
    ITBIS3:            0,               // tasa = 0%
    TotalITBIS:        0,
    TotalITBIS3:       0,
    MontoTotal:        round2(total),
  };
}

/**
 * Totales para E47 (Pagos al Exterior) — orden estricto XSD DGII:
 *   MontoExento → MontoTotal → TotalISRRetencion (solo si > 0)
 * Prohibidos: TotalITBIS, TotalITBIS1/2/3, MontoGravadoTotal, tags vacíos.
 */
export function buildTotalesE47(
  total:    number,
  subtotal: number,
  isr:      number,   // suma de MontoISRRetenido de todos los ítems
): Record<string, unknown> {
  const tot: Record<string, unknown> = {
    MontoExento: round2(subtotal),
    MontoTotal:  round2(total),
  };
  // TotalISRRetencion siempre presente (items siempre tienen Retencion en E47)
  tot['TotalISRRetencion'] = round2(isr);
  return tot;
}

/**
 * Totales cero — CodigoModificacion=2 (corrección de texto):
 * la nota no tiene impacto financiero, todos los montos deben ser 0.
 */
export function buildTotalesCero(): Record<string, unknown> {
  return { MontoExento: 0, MontoTotal: 0 };
}
