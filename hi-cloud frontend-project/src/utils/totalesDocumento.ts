/**
 * Totales de un documento comercial en la PANTALLA, con la misma aritmética que
 * el backend usa para guardarlos.
 *
 * La referencia es
 * `hi-cloud backend-project/backend/src/common/calculo/descuento-documento.ts`,
 * que es lo que de verdad calcula factura, cotización, pro-forma y pre-factura.
 * Aquí se replica —no se importa: son dos proyectos npm distintos— para que lo
 * que el usuario ve mientras teclea sea exactamente lo que va a quedar
 * guardado. `totalesDocumento.test.ts` compara las dos fórmulas sobre miles de
 * documentos generados y falla si se separan un céntimo.
 *
 * Tres detalles que no son casuales, y que copiar mal desviaría el total:
 *
 *   1. el subtotal se redondea POR LÍNEA y luego se suma, no al revés;
 *   2. el ITBIS sale de la base CRUDA, sin el redondeo intermedio — es lo que
 *      evita el céntimo de diferencia contra lo declarado;
 *   3. el descuento general se reparte en proporción al subtotal de cada línea.
 */

export const r2 = (n: number) => Math.round(n * 100) / 100;

export interface LineaDocumento {
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number;
  /** 'monto' = RD$ sobre el bruto de la línea | 'pct' = % */
  descuentoTipo?: 'monto' | 'pct';
  descuentoValor?: number;
}

export interface DescuentoGeneral {
  tipo?: 'monto' | 'porcentaje';
  valor?: number;
}

export interface LineaCalculada {
  /** Descuento propio de la línea, ya topado al bruto */
  descLinea: number;
  /** Subtotal de la línea tras su descuento, ANTES del general */
  subtotal: number;
  /** Base sin redondeo intermedio — de aquí sale el ITBIS */
  baseRaw: number;
  /** Parte del descuento general que le toca */
  descProp: number;
  /** Subtotal final, ya con el general repartido */
  subtotFinal: number;
  ivaLinea: number;
}

export interface TotalesDocumento {
  lineas: LineaCalculada[];
  /** Suma de subtotales de línea ANTES del descuento general */
  subtotalBase: number;
  /** Descuento general efectivamente aplicado */
  descGeneral: number;
  /** Suma de los descuentos por línea */
  descuentoLineasTotal: number;
  subtotal: number;
  iva: number;
  total: number;
}

/**
 * Descuento de una línea en BASE imponible, con el mismo tope que el backend:
 * nunca puede pasarse del bruto de la propia línea.
 */
export function descuentoDeLinea(l: LineaDocumento): number {
  const bruto = r2(l.precioUnitario * l.cantidad);
  const v = Math.max(0, Number(l.descuentoValor) || 0);
  if (!v) return 0;
  return l.descuentoTipo === 'pct'
    ? r2(bruto * Math.min(v, 100) / 100)
    : r2(Math.min(v, bruto));
}

export function calcularTotalesDocumento(
  lineas: LineaDocumento[],
  descuentoGeneral: DescuentoGeneral = {},
): TotalesDocumento {
  const parciales = lineas.map(l => {
    const brutoRaw  = l.precioUnitario * l.cantidad;
    const descLinea = descuentoDeLinea(l);
    return {
      descLinea,
      subtotal: r2(r2(brutoRaw) - descLinea),
      baseRaw:  brutoRaw - descLinea,
      pct:      l.porcentajeIva,
    };
  });

  const subtotalBase = r2(parciales.reduce((s, l) => s + l.subtotal, 0));

  const val = Math.max(0, Number(descuentoGeneral.valor) || 0);
  const descGeneral = !val ? 0
    : descuentoGeneral.tipo === 'porcentaje'
      ? r2(subtotalBase * Math.min(val, 100) / 100)
      : r2(Math.min(val, subtotalBase));

  const calculadas: LineaCalculada[] = parciales.map(l => {
    const descProp    = subtotalBase > 0 ? r2((l.subtotal / subtotalBase) * descGeneral) : 0;
    const subtotFinal = r2(l.subtotal - descProp);
    const rawFinal    = l.subtotal > 0 ? l.baseRaw * (subtotFinal / l.subtotal) : subtotFinal;
    return {
      descLinea: l.descLinea,
      subtotal:  l.subtotal,
      baseRaw:   l.baseRaw,
      descProp,
      subtotFinal,
      ivaLinea:  r2(rawFinal * (l.pct / 100)),
    };
  });

  const subtotal = r2(calculadas.reduce((s, l) => s + l.subtotFinal, 0));
  const iva      = r2(calculadas.reduce((s, l) => s + l.ivaLinea, 0));

  return {
    lineas: calculadas,
    subtotalBase,
    descGeneral,
    descuentoLineasTotal: r2(parciales.reduce((s, l) => s + l.descLinea, 0)),
    subtotal,
    iva,
    total: r2(subtotal + iva),
  };
}
