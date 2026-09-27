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
  /**
   * 'subtotal' (default) = valor se resta del subtotal, ITBIS se recalcula
   * sobre el neto. 'total' = valor es cuánto debe bajar el TOTAL final (con
   * ITBIS incluido) — con tasas mixtas se reparte por el peso de cada línea
   * en el total, no en el subtotal.
   */
  aplicarSobre?: 'subtotal' | 'total';
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

  // aplicarSobre === 'total': ver descuento-documento.ts (backend) para la
  // explicación completa del reparto por peso-en-el-total y por qué la
  // última línea se calcula por diferencia (para que la suma cuadre exacto).
  if (descuentoGeneral.aplicarSobre === 'total') {
    const dgt = descuentoGeneral.tipo;
    const dgv = Number(descuentoGeneral.valor ?? 0);
    const totalesPre = calculadas.map(l => ({ ...l, totalPre: l.subtotal * (1 + l.porcentajeItbis / 100) }));
    const totalDocPre = totalesPre.reduce((s, l) => s + l.totalPre, 0);

    let dTotalDeseado = 0;
    if (dgt === 'monto' && dgv > 0) {
      dTotalDeseado = Math.min(dgv, totalDocPre);
    } else if (dgt === 'porcentaje' && dgv > 0) {
      dTotalDeseado = totalDocPre * (dgv / 100);
    }

    const totalDocObjetivo = r2(r2(totalDocPre) - r2(dTotalDeseado));
    const lineasSalida: { subtotal: number; itbis: number }[] = [];
    let sumaAsignada = 0;

    totalesPre.forEach((l, i) => {
      const esUltima = i === totalesPre.length - 1;
      if (!esUltima) {
        const peso = totalDocPre > 0 ? l.totalPre / totalDocPre : 0;
        const descProp = (dTotalDeseado * peso) / (1 + l.porcentajeItbis / 100);
        const subtotalFinal = r2(l.subtotal - descProp);
        const itbisFinal = r2(subtotalFinal * (l.porcentajeItbis / 100));
        sumaAsignada += r2(subtotalFinal + itbisFinal);
        lineasSalida.push({ subtotal: subtotalFinal, itbis: itbisFinal });
      } else {
        const totalFinal = r2(totalDocObjetivo - sumaAsignada);
        const subtotalFinal = r2(totalFinal / (1 + l.porcentajeItbis / 100));
        const itbisFinal = r2(totalFinal - subtotalFinal);
        lineasSalida.push({ subtotal: subtotalFinal, itbis: itbisFinal });
      }
    });

    const subtotalDoc = r2(lineasSalida.reduce((s, l) => s + l.subtotal, 0));
    const itbisDoc = r2(lineasSalida.reduce((s, l) => s + l.itbis, 0));
    return {
      subtotalBase,
      descuentoGeneral: r2(subtotalBase - subtotalDoc),
      subtotal: subtotalDoc,
      itbis: itbisDoc,
      total: r2(subtotalDoc + itbisDoc),
      lineas: lineasSalida,
    };
  }

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
