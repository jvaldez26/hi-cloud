import { Logger } from '@nestjs/common';
import { round2 } from './totales.section';
import { sanitizeText } from '../../../common/utils/text.utils';

const itemsLogger = new Logger('ECFItems');

interface DetalleLike {
  descripcion:    string;
  cantidad:       number | string;
  precioUnitario: number | string;
  porcentajeIva:  number | string;
  subtotal:       number | string;
  importeIva?:    number | string;
  iva?:           number | string;
  descuentoMonto?: number | string;
  descuentoPct?:   number | string;
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
 * DGII valida cantidad × precioUnitario = MontoItem + DescuentoMonto en el XML.
 * Si hay discrepancia > 0.01 se rechaza el e-CF y se quema la secuencia (errores 1924/11105).
 */
export function warnCuadraturaDGII(
  d: DetalleLike,
  context: string,
): void {
  const cantidad  = Number(d.cantidad);
  const precio    = Number(d.precioUnitario);
  const montoItem = round2(Number(d.subtotal));
  const descuento = round2(Number(d.descuentoMonto ?? 0));
  const brutoCalc = round2(cantidad * precio);
  const brutoXML  = round2(montoItem + descuento);
  if (Math.abs(brutoXML - brutoCalc) > 0.01) {
    itemsLogger.warn(
      `Cuadratura DGII [${context}] item="${d.descripcion}" ` +
      `cantidad=${cantidad} precio=${precio} ` +
      `MontoItem=${montoItem} DescuentoMonto=${descuento} ` +
      `brutoXML=${brutoXML} brutoCalc=${brutoCalc}`,
    );
  }
}

/**
 * Valida la cuadratura DGII sobre el Item YA SERIALIZADO (lo que se envía a
 * MSeller), no sobre el detalle de entrada. DGII exige por línea:
 *   CantidadItem × PrecioUnitarioItem = MontoItem + DescuentoMonto
 * A diferencia de warnCuadraturaDGII (que mira d.descuentoMonto del detalle y da
 * falsa tranquilidad), esto detecta cuando el Item trae MontoItem con el
 * descuento ya restado pero OMITE DescuentoMonto — era la adv. 2394
 * "MontoItem no válido" en las líneas con descuento.
 */
export function warnCuadraturaItem(
  item: Record<string, unknown>,
  context: string,
): void {
  const cantidad  = Number(item.CantidadItem);
  const precio    = Number(item.PrecioUnitarioItem);
  const montoItem = Number(item.MontoItem);
  const descuento = Number(item.DescuentoMonto ?? 0);
  const brutoCalc = round2(cantidad * precio);
  const brutoXML  = round2(montoItem + descuento);
  if (Math.abs(brutoXML - brutoCalc) > 0.01) {
    itemsLogger.warn(
      `Cuadratura DGII [${context}] item="${item.NombreItem}" ` +
      `cantidad=${cantidad} precio=${precio} MontoItem=${montoItem} ` +
      `DescuentoMonto=${descuento} brutoXML=${brutoXML} brutoCalc=${brutoCalc} ` +
      `— Item serializado no cuadra (¿DescuentoMonto omitido?)`,
    );
  }
}

/**
 * Ítems estándar — todos los tipos de e-CF (E31–E47).
 * El ITBIS 18% estándar NO se declara en TablaImpuesto dentro del ítem;
 * va únicamente en los Totales del encabezado del documento (estándar DGII XSD).
 * IndicadorFacturacion identifica el tipo de gravamen por línea.
 *
 * DescuentoMonto = bruto - MontoItem (solo se incluye cuando > 0).
 * PrecioUnitarioItem siempre es el precio original sin descuento.
 */
export function buildItems(detalles: DetalleLike[], encf = ''): Record<string, unknown>[] {
  return (detalles ?? []).map((d, idx) => {
    const montoItem = round2(Number(d.subtotal));
    const bruto     = round2(Number(d.precioUnitario) * Number(d.cantidad));
    const descMonto = round2(bruto - montoItem);

    warnCuadraturaDGII(
      { ...d, descuentoMonto: descMonto },
      encf || `item#${idx + 1}`,
    );

    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
      NombreItem:             sanitizeText(d.descripcion),
      IndicadorBienoServicio: 1,
      CantidadItem:           cap4(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
      ...(descMonto > 0 ? { DescuentoMonto: descMonto } : {}),
      MontoItem:              montoItem,
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
    const montoItem = round2(Number(d.subtotal));
    const bruto     = round2(Number(d.precioUnitario) * Number(d.cantidad));
    const descMonto = round2(bruto - montoItem);

    warnCuadraturaDGII(
      { ...d, descuentoMonto: descMonto },
      encf || `item#${idx + 1}`,
    );

    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
      NombreItem:             sanitizeText(d.descripcion),
      IndicadorBienoServicio: 1,
      CantidadItem:           String(cap4(d.cantidad)),
      UnidadMedida:           '47',
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)).toFixed(2),
      ...(descMonto > 0 ? { DescuentoMonto: descMonto.toFixed(2) } : {}),
      MontoItem:              montoItem.toFixed(2),
    };
  });
}
