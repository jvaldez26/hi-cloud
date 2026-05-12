import { round2 } from './totales.section';

interface DetalleLike {
  descripcion:    string;
  cantidad:       number | string;
  precioUnitario: number | string;
  porcentajeIva:  number | string;
  subtotal:       number | string;
  importeIva?:    number | string;
  iva?:           number | string;
}

function indicadorFacturacion(pct: number): 1 | 2 | 4 {
  if (pct === 18) return 1;
  if (pct === 16) return 2;
  return 4;
}

function tasaImpuesto(indicador: 1 | 2 | 4): 1 | 2 | 3 {
  if (indicador === 1) return 1;   // 18%
  if (indicador === 2) return 2;   // 16%
  return 3;                        // 0%
}

/**
 * Ítems estándar sin TablaImpuesto — E32, E33, E34, E43, E44, E46, E47.
 * Valores numéricos, UnidadMedida=43.
 */
export function buildItems(detalles: DetalleLike[]): Record<string, unknown>[] {
  return (detalles ?? []).map((d, idx) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
    NombreItem:             d.descripcion,
    IndicadorBienoServicio: 1,
    CantidadItem:           Number(d.cantidad),
    UnidadMedida:           43,
    PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
    MontoItem:              round2(Number(d.subtotal)),
  }));
}

/**
 * Ítems con TablaImpuesto — E31, E41, E45.
 * Agrega la sección TablaImpuesto por ítem con la tasa e importe del ITBIS.
 */
export function buildItemsConImpuesto(detalles: DetalleLike[]): Record<string, unknown>[] {
  return (detalles ?? []).map((d, idx) => {
    const pct       = Number(d.porcentajeIva);
    const indicador = indicadorFacturacion(pct);
    const montoIva  = round2(Number(d.importeIva ?? d.iva ?? 0));
    const item: Record<string, unknown> = {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicador,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
      MontoItem:              round2(Number(d.subtotal)),
    };
    if (montoIva > 0) {
      item['TablaImpuesto'] = {
        Impuesto: [{ TasaImpuesto: tasaImpuesto(indicador), MontoImpuesto: montoIva }],
      };
    }
    return item;
  });
}

/**
 * Ítems E33 (Nota de Débito) — valores STRING y UnidadMedida='47' según spec DGII.
 */
export function buildItemsE33(detalles: DetalleLike[]): Record<string, unknown>[] {
  return (detalles ?? []).map((d, idx) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
    NombreItem:             d.descripcion,
    IndicadorBienoServicio: 1,
    CantidadItem:           String(round2(Number(d.cantidad))),
    UnidadMedida:           '47',
    PrecioUnitarioItem:     round2(Number(d.precioUnitario)).toFixed(2),
    MontoItem:              round2(Number(d.subtotal)).toFixed(2),
  }));
}
