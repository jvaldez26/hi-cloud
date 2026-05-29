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

/**
 * Ítems estándar — todos los tipos de e-CF (E31–E47).
 * El ITBIS 18% estándar NO se declara en TablaImpuesto dentro del ítem;
 * va únicamente en los Totales del encabezado del documento (estándar DGII XSD).
 * IndicadorFacturacion identifica el tipo de gravamen por línea.
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
 * @deprecated Usar buildItems — TablaImpuesto dentro del ítem es inválida
 * según XSD DGII (causa Código de Error 3). El ITBIS va solo en Totales.
 */
export const buildItemsConImpuesto = buildItems;

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
