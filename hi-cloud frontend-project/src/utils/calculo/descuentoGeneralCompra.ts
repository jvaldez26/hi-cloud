/**
 * Preview en el frontend del descuento general de una Orden de Compra —
 * PORTADO literalmente del motor de backend (calcularTotalesConDescuento en
 * common/calculo/descuento-documento.ts), acotado a la Convención A que usa
 * Compras (precioUnitario = precio bruto, descuentoMonto = descuento total
 * de la línea; sin la convención B de POS con precioOriginal).
 *
 * Es solo para que el pie del formulario reaccione al instante mientras se
 * teclea — el backend recalcula esto mismo con el motor real al guardar
 * (compras.service.ts → calcularDetalles), que es la fuente de verdad.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface LineaDescuentoGeneralInput {
  cantidad: number;
  precioUnitario: number;
  descuentoMonto?: number | null;
  porcentajeItbis: number;
}

export interface DescuentoGeneralInput {
  tipo?: 'monto' | 'porcentaje';
  valor?: number | null;
}

export interface TotalesConDescuentoGeneral {
  /** Suma de subtotales de línea (ya netos del descuento de línea) ANTES del general */
  subtotalBase: number;
  /** Descuento general efectivamente aplicado, en base imponible */
  descuentoGeneral: number;
  subtotal: number;
  itbis: number;
  total: number;
  /** Por línea, YA con el descuento general prorrateado — para conversión a DOP línea por línea. */
  lineas: { subtotal: number; itbis: number }[];
}

export function calcularTotalesConDescuentoGeneral(
  lineas: LineaDescuentoGeneralInput[],
  descuentoGeneral: DescuentoGeneralInput = {},
): TotalesConDescuentoGeneral {
  const calculadas = lineas.map(l => {
    const bruto = r2(l.precioUnitario * l.cantidad);
    const descLinea = r2(Math.min(l.descuentoMonto ?? 0, bruto));
    return {
      subtotal: r2(bruto - descLinea),
      porcentajeItbis: l.porcentajeItbis,
    };
  });

  let subtotalBase = r2(calculadas.reduce((s, l) => s + l.subtotal, 0));

  let descGeneral = 0;
  const dgt = descuentoGeneral.tipo;
  const dgv = Number(descuentoGeneral.valor ?? 0);
  if (dgt === 'monto' && dgv > 0) {
    descGeneral = r2(Math.min(dgv, subtotalBase));
  } else if (dgt === 'porcentaje' && dgv > 0) {
    descGeneral = r2(subtotalBase * (dgv / 100));
  }

  let subtotal = 0;
  let itbis = 0;
  const lineasSalida = calculadas.map(l => {
    const descProp = subtotalBase > 0 ? r2((l.subtotal / subtotalBase) * descGeneral) : 0;
    const subtotalFinal = r2(l.subtotal - descProp);
    const itbisFinal = r2(subtotalFinal * (l.porcentajeItbis / 100));
    subtotal += subtotalFinal;
    itbis += itbisFinal;
    return { subtotal: subtotalFinal, itbis: itbisFinal };
  });
  subtotal = r2(subtotal);
  itbis = r2(itbis);

  return { subtotalBase, descuentoGeneral: descGeneral, subtotal, itbis, total: r2(subtotal + itbis), lineas: lineasSalida };
}
