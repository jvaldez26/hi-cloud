import { descuentoFinalABase, descuentoBaseAFinal, pctIvaEfectivo, round4 } from './descuentoItbis';

/**
 * Totales del carrito del POS — lo que el cajero ve y lo que se cobra.
 *
 * Sale de `POSPage.tsx`, donde vivía inline entre 13.000 líneas y no había forma
 * de probarlo. La copia es LITERAL: mismo orden de operaciones, mismos
 * redondeos, mismos nombres. `totalesCarritoPOS.test.ts` la compara contra el
 * bloque original congelado sobre miles de carritos y falla si se separan un
 * céntimo.
 *
 * Extraerlo no cambia ningún importe. Lo que cambia es que ahora se puede medir:
 * el POS y el backend redondean el descuento de línea de forma distinta y eso
 * desvía algunos documentos, cosa que antes solo se podía comprobar a mano.
 *
 * Devuelve las CATORCE variables que el bloque definía, incluidas las seis que
 * el componente no usa fuera (`lineasBase`, `descGlobalVal`, `pctIvaCarrito`,
 * `totalConItbis`, `lineasConDesc`, `subtotalConDesc`). Se exponen a propósito:
 * el test las compara todas, y comparar solo las ocho visibles dejaría sin
 * vigilar la mitad del cálculo.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ItemCarritoPOS {
  /** Precio unitario tal como está en el carrito */
  precio: number;
  cantidad: number;
  /** Descuento por unidad, en la misma unidad que `precio` */
  descuentoMonto: number;
  produto: { porcentajeIva?: number | null } & Record<string, unknown>;
}

export interface OpcionesCarritoPOS {
  /** Lo que el cajero tecleó en el descuento global, tal cual (texto) */
  descGlobal: string;
  descGlobalTipo: 'fijo' | 'pct';
  /**
   * Config `posPrecioIncluyeItbis`. HOY el POS la fuerza a false — ver el
   * comentario en POSPage: enviaba el precio con ITBIS y el backend le aplicaba
   * ITBIS por encima, dejando la factura ~18% arriba de lo cobrado (neutralizado
   * en `4ce77084`, 2026-08-11). Se mantiene como parámetro para que el día que
   * se reactive haya dónde probarlo.
   */
  precioIncluyeItbis: boolean;
  /** Tipo de NCF; 'E44' (Zona Franca) no lleva ITBIS */
  tipoNcf: string;
}

export interface LineaBasePOS { pct: number; baseRaw: number; subtotal: number }
export interface LineaConDescPOS { subtotFinal: number; ivaLinea: number }

export interface TotalesCarritoPOS {
  lineasBase: LineaBasePOS[];
  subtotal: number;
  iva: number;
  descGlobalVal: number;
  pctIvaCarrito: number;
  totalConItbis: number;
  descGlobalMonto: number;
  descGlobalFinal: number;
  lineasConDesc: LineaConDescPOS[];
  subtotalConDesc: number;
  ivaConDesc: number;
  total: number;
  ivaEfectivo: number;
  totalEfectivo: number;
}

export function calcularTotalesCarritoPOS(
  cart: ItemCarritoPOS[],
  { descGlobal, descGlobalTipo, precioIncluyeItbis, tipoNcf }: OpcionesCarritoPOS,
): TotalesCarritoPOS {
  // Base cruda por línea (sin redondeo intermedio) — subtotal e ITBIS se redondean
  // POR LÍNEA igual que facturas.service, para que el total que cobra la caja sea
  // EXACTAMENTE el que guarda el backend y el que se declara a DGII.
  const lineasBase = cart.map(i => {
    const pct      = Number((i.produto as any).porcentajeIva ?? 0) / 100;
    const lineaRaw = (i.precio - i.descuentoMonto) * i.cantidad;
    const baseRaw  = precioIncluyeItbis && pct > 0 ? lineaRaw / (1 + pct) : lineaRaw;
    return { pct, baseRaw, subtotal: round2(baseRaw) };
  });
  const subtotal = round2(lineasBase.reduce((s, l) => s + l.subtotal, 0));
  const iva      = round2(lineasBase.reduce((s, l) => s + round2(l.baseRaw * l.pct), 0));
  // ── Descuento global ───────────────────────────────────────────────────────
  // El cajero teclea en pesos FINALES (c/ITBIS) — MISMA regla que el descuento
  // por ítem (descuentoFinalABase). Se guarda en BASE imponible porque el ITBIS
  // se recalcula sobre la base ya descontada.
  //   fijo:       RD$10 tecleados  → el total baja EXACTAMENTE RD$10
  //   porcentaje: 10% tecleado     → el total baja EXACTAMENTE 10%
  // La tasa usada es la EFECTIVA del carrito (iva/subtotal), así funciona con
  // mezcla de 18% / 16% / exentos igual que el reparto proporcional del backend.
  const descGlobalVal   = Math.max(0, parseFloat(descGlobal) || 0);
  // E44 (Zona Franca) no cobra ITBIS: el precio que ve el cajero YA es el final,
  // así que el descuento tecleado no se convierte.
  const pctIvaCarrito   = tipoNcf === 'E44' ? 0 : pctIvaEfectivo(subtotal, iva);
  const totalConItbis   = tipoNcf === 'E44' ? subtotal : round2(subtotal + iva);
  // 4 decimales, no 2: el importe sale de una división y redondearlo aquí
  // desviaría el total hasta un centavo respecto de lo que cobra la caja.
  // La columna es NUMERIC(12,4) y el DTO valida 4dp.
  const descGlobalMonto = round4(descGlobalTipo === 'pct'
    // % sobre la base → el total baja ese mismo % (proporcional, no requiere conversión)
    ? subtotal * Math.min(descGlobalVal, 100) / 100
    // monto en pesos finales → base imponible, capeado al total cobrable
    : Math.min(
        descuentoFinalABase(Math.min(descGlobalVal, totalConItbis), pctIvaCarrito, precioIncluyeItbis),
        subtotal,
      ));
  // Equivalente en pesos FINALES del descuento global — SOLO para pantalla.
  // En modo fijo es exactamente lo que tecleó el cajero (tras el cap); en % es la
  // rebaja real sobre lo que paga el cliente.
  const descGlobalFinal = descGlobalTipo === 'fijo'
    ? round2(Math.min(descGlobalVal, totalConItbis))
    : descuentoBaseAFinal(descGlobalMonto, pctIvaCarrito, precioIncluyeItbis);
  // Reparto proporcional del descuento y recálculo del ITBIS — MISMO orden de
  // operaciones que facturas.service.create(). Escalar el ITBIS ya redondeado
  // (iva × ratio) desviaba hasta 1 centavo del total guardado y declarado.
  const lineasConDesc = lineasBase.map(l => {
    const descProp    = subtotal > 0 ? round2((l.subtotal / subtotal) * descGlobalMonto) : 0;
    const subtotFinal = round2(l.subtotal - descProp);
    const rawFinal    = l.subtotal > 0 ? l.baseRaw * (subtotFinal / l.subtotal) : subtotFinal;
    return { subtotFinal, ivaLinea: round2(rawFinal * l.pct) };
  });
  const subtotalConDesc = round2(lineasConDesc.reduce((s, l) => s + l.subtotFinal, 0));
  const ivaConDesc      = round2(lineasConDesc.reduce((s, l) => s + l.ivaLinea,    0));
  const total           = round2(subtotalConDesc + ivaConDesc);
  // E44 (Zona Franca): ITBIS = 0 — Opción B: precio base sin ITBIS
  const ivaEfectivo   = tipoNcf === 'E44' ? 0 : ivaConDesc;
  const totalEfectivo = tipoNcf === 'E44' ? subtotalConDesc : total;

  return {
    lineasBase, subtotal, iva, descGlobalVal, pctIvaCarrito, totalConItbis,
    descGlobalMonto, descGlobalFinal, lineasConDesc, subtotalConDesc,
    ivaConDesc, total, ivaEfectivo, totalEfectivo,
  };
}
