/**
 * descuentoItbis — conversión ÚNICA entre el descuento que TECLEA el cajero
 * (pesos finales, c/ITBIS) y el descuento que se GUARDA (base imponible).
 *
 * REGLA DE NEGOCIO (POS): el cajero piensa siempre en pesos finales — el precio
 * que el cliente ve anunciado ya lleva ITBIS. Si teclea "10" sobre un producto
 * de RD$200 c/ITBIS, el cliente debe pagar RD$190.00 exactos.
 *
 * Almacenamiento: todos los descuentos se guardan en BASE IMPONIBLE
 *   (factura_detalles.descuentoMonto y facturas.descuentoGeneralValor),
 *   porque el backend calcula el ITBIS sobre la base ya descontada.
 *
 * Estas dos funciones son la ÚNICA fuente de esa conversión. Todo camino de
 * descuento (por ítem, global en monto, global en %, y sus reimpresiones)
 * debe pasar por aquí — no duplicar la fórmula.
 *
 * `precioIncluyeItbis` = config `posPrecioIncluyeItbis` de la empresa:
 *   • false (por defecto): los precios del carrito están en BASE → el descuento
 *     tecleado en finales SÍ se convierte (÷ 1 + pctIva).
 *   • true: los precios del carrito ya son finales → el descuento tecleado ya
 *     está en la misma unidad que el precio y NO se convierte.
 */

/**
 * Redondeo a 4 decimales — la precisión en que se GUARDAN los descuentos en
 * base imponible (factura_detalles.descuentoMonto y
 * facturas.descuentoGeneralValor son NUMERIC(12,4), y los DTO validan 4dp).
 * Redondear a 2 desvía el total hasta un centavo respecto de lo cobrado.
 */
export function round4(n: number): number {
  return parseFloat((Number(n) || 0).toFixed(4));
}

/** Descuento tecleado por el cajero (pesos FINALES, c/ITBIS) → base imponible. */
export function descuentoFinalABase(
  valorFinal: number,
  pctIva: number,
  precioIncluyeItbis = false,
): number {
  const v = Math.max(0, Number(valorFinal) || 0);
  if (precioIncluyeItbis || !(pctIva > 0)) return v;
  return parseFloat((v / (1 + pctIva)).toFixed(4));
}

/** Descuento guardado en base imponible → pesos FINALES (lo que el cajero ve). */
export function descuentoBaseAFinal(
  valorBase: number,
  pctIva: number,
  precioIncluyeItbis = false,
): number {
  const v = Math.max(0, Number(valorBase) || 0);
  if (precioIncluyeItbis || !(pctIva > 0)) return v;
  return parseFloat((v * (1 + pctIva)).toFixed(2));
}

/**
 * Tasa de ITBIS EFECTIVA de un conjunto de líneas (carrito o factura completa).
 *
 * El descuento GLOBAL no pertenece a un producto: el carrito puede mezclar 18%,
 * 16% y exentos. Como el backend reparte el descuento general de forma
 * proporcional al subtotal de cada línea, la reducción del total es exactamente
 * `descuentoBase × (1 + iva/subtotal)`. Por eso `iva/subtotal` es el pctIva que
 * hay que pasar a las funciones de arriba para que el total baje EXACTAMENTE lo
 * que el cajero tecleó, sin importar la mezcla de tasas.
 */
export function pctIvaEfectivo(subtotalBase: number, ivaTotal: number): number {
  const s = Number(subtotalBase) || 0;
  const i = Number(ivaTotal) || 0;
  return s > 0 ? i / s : 0;
}
