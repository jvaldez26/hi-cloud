import { Logger } from '@nestjs/common';
import { round2 } from './totales.section';
import { sanitizeText } from '../../../common/utils/text.utils';

const itemsLogger = new Logger('ECFItems');

const NOMBRE_ITEM_MAX = 80;

/**
 * Trunca NombreItem al límite AlfaNum80 del XSD DGII (80 caracteres).
 * Corta en el último espacio antes del límite; elimina coma/espacio final.
 * Si no hay espacio, corta en el caracter 80.
 * Registra cada truncamiento con el e-NCF y campo para auditoría.
 */
export function truncarNombreItem(s: string | null | undefined, encf = ''): string {
  const txt = sanitizeText(s);
  if (txt.length <= NOMBRE_ITEM_MAX) return txt;
  const corte = txt.lastIndexOf(' ', NOMBRE_ITEM_MAX);
  const resultado = (corte > 0 ? txt.substring(0, corte) : txt.substring(0, NOMBRE_ITEM_MAX))
    .replace(/[,\s]+$/, '');
  itemsLogger.warn(
    `NombreItem truncado [${encf || 'sin-encf'}] "${txt.substring(0, 40)}…" (${txt.length} → ${resultado.length} chars)`,
  );
  return resultado;
}

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
 * Opciones para buildItems / buildItemsE33.
 */
export interface BuildItemsOptions {
  /**
   * Convierte un monto de la moneda original (ME) a RD$. Identidad para
   * facturas DOP. Defecto: (x) => x.
   */
  toDOP?: (v: number) => number;
  /**
   * Construye el bloque OtraMonedaDetalle para una línea (facturas ME).
   * Recibe el precio y el monto en la moneda original. Retorna null/undefined
   * cuando no aplica (facturas DOP).
   */
  otraMonedaItem?: (precioME: number, montoME: number) => unknown | null | undefined;
}

/**
 * Ítems estándar — todos los tipos de e-CF (E31–E47).
 *
 * Estrategia PrecioUnitarioItem:
 *   • Descuento real (d.descuentoMonto > 0): se usa el precio original redondeado a 2 dec y
 *     se emite DescuentoMonto + TablaSubDescuento para que DGII valide
 *     CantidadItem × PrecioUnitarioItem − DescuentoMonto = MontoItem.
 *   • Sin descuento: se deriva el precio de MontoItem ÷ CantidadItem (cap4, técnica E31),
 *     garantizando cuadratura exacta sin emitir DescuentoMonto fantasma.
 *
 * El ITBIS 18% estándar NO se declara en TablaImpuesto dentro del ítem;
 * va únicamente en los Totales del encabezado del documento (estándar DGII XSD).
 * IndicadorFacturacion identifica el tipo de gravamen por línea.
 */
export function buildItems(
  detalles: DetalleLike[],
  encf = '',
  opts: BuildItemsOptions = {},
): Record<string, unknown>[] {
  const { toDOP = (x: number) => x, otraMonedaItem } = opts;

  return (detalles ?? []).map((d, idx) => {
    const cantidad  = cap4(d.cantidad);
    const precioME  = Number(d.precioUnitario);
    const montoME   = Number(d.subtotal);
    const descReal  = round2(Number(d.descuentoMonto ?? 0));

    const montoItem = round2(toDOP(montoME));

    // PrecioUnitarioItem — dos estrategias según presencia de descuento real:
    //   Con descuento: precio original (round2) + DescuentoMonto + TablaSubDescuento
    //   Sin descuento: derivado de MontoItem÷cantidad (cap4) → cuadratura exacta,
    //                  sin DescuentoMonto fantasma por residuos de redondeo.
    const precioDOP = round2(toDOP(precioME));
    const precioXML = descReal > 0
      ? precioDOP
      : cap4(montoItem / (cantidad || 1));

    // DescuentoMonto computado aritméticamente sobre el precioXML serializado,
    // de modo que CantidadItem × PrecioUnitarioItem − DescuentoMonto = MontoItem
    // se cumpla exactamente (regla XSD DGII, adv. 2394).
    const descMonto = descReal > 0
      ? round2(round2(precioXML * cantidad) - montoItem)
      : 0;

    const otME = otraMonedaItem?.(precioME, montoME) ?? null;

    const item: Record<string, unknown> = {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 1,
      CantidadItem:           cantidad,
      UnidadMedida:           43,
      PrecioUnitarioItem:     precioXML,
      ...(descMonto > 0 ? {
        DescuentoMonto: descMonto,
        TablaSubDescuento: {
          SubDescuento: [{ TipoSubDescuento: '$', MontoSubDescuento: descMonto }],
        },
      } : {}),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem: montoItem,
    };

    warnCuadraturaItem(item, encf || `item#${idx + 1}`);
    return item;
  });
}

/**
 * @deprecated Usar buildItems — TablaImpuesto dentro del ítem es inválida
 * según XSD DGII (causa Código de Error 3). El ITBIS va solo en Totales.
 */
export const buildItemsConImpuesto = buildItems;

/**
 * Ítems E33 (Nota de Débito) — valores STRING y UnidadMedida='47' según spec DGII.
 * Misma estrategia PrecioUnitarioItem/DescuentoMonto que buildItems.
 */
export function buildItemsE33(detalles: DetalleLike[], encf = ''): Record<string, unknown>[] {
  return (detalles ?? []).map((d, idx) => {
    const cantidad  = cap4(d.cantidad);
    const descReal  = round2(Number(d.descuentoMonto ?? 0));
    const montoItem = round2(Number(d.subtotal));

    const precioDOP = round2(Number(d.precioUnitario));
    const precioXML = descReal > 0
      ? precioDOP
      : cap4(montoItem / (cantidad || 1));

    const descMonto = descReal > 0
      ? round2(round2(precioXML * cantidad) - montoItem)
      : 0;

    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicadorFacturacion(Number(d.porcentajeIva)),
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 1,
      CantidadItem:           String(cantidad),
      UnidadMedida:           '47',
      PrecioUnitarioItem:     precioXML.toFixed(2),
      ...(descMonto > 0 ? {
        DescuentoMonto: descMonto.toFixed(2),
        TablaSubDescuento: {
          SubDescuento: [{ TipoSubDescuento: '$', MontoSubDescuento: descMonto.toFixed(2) }],
        },
      } : {}),
      MontoItem: montoItem.toFixed(2),
    };
  });
}
