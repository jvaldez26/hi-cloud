import { Logger } from '@nestjs/common';
import { round2 } from './totales.section';

const itemsLogger = new Logger('ECFItems');

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

/** Cap a exactamente 4 decimales para cumplir XSD DGII (CantidadItem admite hasta 4 dec). */
function cap4(n: number | string): number {
  return parseFloat(Number(n).toFixed(4));
}

/**
 * DGII valida cantidad × precioUnitario = MontoItem en el XML.
 * Si hay discrepancia > 0.01 se rechaza el e-CF y se quema la secuencia (errores 1924/11105).
 * Loguear cuando el subtotal recibido difiere del calculado, para detectar problemas en el frontend.
 */
export function warnCuadraturaDGII(
  d: DetalleLike,
  context: string,
): void {
  const cantidad     = Number(d.cantidad);
  const precio       = Number(d.precioUnitario);
  const subtotalRecibido  = round2(Number(d.subtotal));
  const subtotalCalculado = round2(cantidad * precio);
  if (Math.abs(subtotalRecibido - subtotalCalculado) > 0.01) {
    itemsLogger.warn(
      `Cuadratura DGII [${context}] item="${d.descripcion}" ` +
      `cantidad=${cantidad} precio=${precio} ` +
      `subtotalRecibido=${subtotalRecibido} subtotalCalculado=${subtotalCalculado}`,
    );
  }
}

/**
 * Ítems estándar — todos los tipos de e-CF (E31–E47).
 * El ITBIS 18% estándar NO se declara en TablaImpuesto dentro del ítem;
 * va únicamente en los Totales del encabezado del documento (estándar DGII XSD).
 * IndicadorFacturacion identifica el tipo de gravamen por línea.
 */
export function buildItems(detalles: DetalleLike[], encf = ''): Record<string, unknown>[] {
  return (detalles ?? []).map((d, idx) => {
    warnCuadraturaDGII(d, encf || `item#${idx + 1}`);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           cap4(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
      MontoItem:              round2(Number(d.subtotal)),
    };
  });
}

/**
 * @deprecated Usar buildItems — TablaImpuesto dentro del ítem es inválida
 * según XSD DGII (causa Código de Error 3). El ITBIS va solo en Totales.
 */
export const buildItemsConImpuesto = buildItems;

/**
 * Ítems E33 (Nota de Débito) — valores STRING y UnidadMedida='47' según spec DGII.
 */
export function buildItemsE33(detalles: DetalleLike[], encf = ''): Record<string, unknown>[] {
  return (detalles ?? []).map((d, idx) => {
    warnCuadraturaDGII(d, encf || `item#${idx + 1}`);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           String(cap4(d.cantidad)),
      UnidadMedida:           '47',
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)).toFixed(2),
      MontoItem:              round2(Number(d.subtotal)).toFixed(2),
    };
  });
}
