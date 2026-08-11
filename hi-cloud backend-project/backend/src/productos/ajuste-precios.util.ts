/**
 * Redondeo de PRECIOS AL PÚBLICO (c/ITBIS).
 *
 * El problema que resuelve: muchos productos se cargaron tecleando la base en
 * vez del precio al público, así que 339.00 × 1.18 = 400.02 en vez de 400.00.
 * Aquí se elige el precio final "bonito" y se despeja la base que lo produce.
 *
 * Lógica pura, sin dependencias: es la pieza donde un error se traduce en
 * precios de venta equivocados en el catálogo de un cliente real.
 */

export type ModoRedondeo =
  | 'entero'        // 400
  | 'multiplo5'     // 400, 405, 410…
  | 'multiplo10'    // 400, 410, 420…
  | 'terminacion95' // 399.95
  | 'terminacion99';// 399.99

export type DireccionRedondeo = 'cercano' | 'arriba' | 'abajo';

/** Redondea a 4 decimales — la precisión de productos.precio NUMERIC(14,4). */
export function round4(n: number): number {
  return parseFloat(Number(n).toFixed(4));
}

/** Redondea a 2 decimales — la precisión de un precio al público. */
export function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function aplicarDireccion(valor: number, paso: number, dir: DireccionRedondeo): number {
  const q = valor / paso;
  const n = dir === 'arriba' ? Math.ceil(q)
    : dir === 'abajo' ? Math.floor(q)
    : Math.round(q);
  return round2(n * paso);
}

/**
 * Precio al público objetivo según la política del negocio.
 *
 * Las terminaciones .95/.99 se anclan al ENTERO: para 400.02 con .95, el
 * candidato de abajo es 399.95 y el de arriba 400.95; "cercano" elige el que
 * menos mueva el precio. Nunca devuelve 0 o negativo — si el redondeo hacia
 * abajo se comería el precio entero, se sube al primer valor válido.
 */
export function calcularPrecioObjetivo(
  precioFinalActual: number,
  modo: ModoRedondeo,
  direccion: DireccionRedondeo = 'cercano',
): number {
  const actual = round2(precioFinalActual);
  if (!(actual > 0)) return 0;

  let objetivo: number;

  if (modo === 'terminacion95' || modo === 'terminacion99') {
    const term = modo === 'terminacion95' ? 0.95 : 0.99;
    const entero = Math.floor(actual);
    const abajo  = round2(entero - 1 + term);   // p. ej. 399.95 para 400.02
    const aqui   = round2(entero + term);       // p. ej. 400.95
    if (direccion === 'arriba') objetivo = aqui >= actual ? aqui : round2(entero + 1 + term);
    else if (direccion === 'abajo') objetivo = aqui <= actual ? aqui : abajo;
    else {
      const cand = [abajo, aqui, round2(entero + 1 + term)];
      objetivo = cand.reduce((mejor, c) =>
        Math.abs(c - actual) < Math.abs(mejor - actual) ? c : mejor, cand[0]);
    }
  } else {
    const paso = modo === 'multiplo10' ? 10 : modo === 'multiplo5' ? 5 : 1;
    objetivo = aplicarDireccion(actual, paso, direccion);
  }

  // Nunca dejar el precio en cero o negativo por redondear hacia abajo
  if (objetivo <= 0) {
    if (modo === 'terminacion95') return 0.95;
    if (modo === 'terminacion99') return 0.99;
    return modo === 'multiplo10' ? 10 : modo === 'multiplo5' ? 5 : 1;
  }
  return objetivo;
}

export interface FilaAjuste {
  precioFinalActual:   number;
  precioFinalPropuesto: number;
  baseActual:          number;
  baseNueva:           number;
  diferencia:          number;   // sobre el precio al público
  /** false cuando la base despejada NO reproduce el objetivo — la fila se excluye */
  verificado:          boolean;
  motivoExclusion?:    string;
}

/**
 * Despeja la base imponible que produce el precio al público objetivo y VERIFICA
 * el viaje de vuelta: baseNueva × (1 + iva) redondeado a 2 debe dar exactamente
 * el objetivo. Si no cuadra (puede pasar con tasas raras), la fila se marca como
 * no verificada para que la UI la excluya en vez de escribir un precio erróneo.
 *
 * Producto exento (iva = 0): el precio al público ES la base, sin conversión.
 */
export function calcularFila(
  baseActual: number,
  pctIva: number,
  modo: ModoRedondeo,
  direccion: DireccionRedondeo = 'cercano',
): FilaAjuste {
  const factor = 1 + (Number(pctIva) || 0) / 100;
  const base   = Number(baseActual) || 0;
  const finalActual = round2(base * factor);
  const objetivo    = calcularPrecioObjetivo(finalActual, modo, direccion);

  const baseNueva = factor === 1 ? round2(objetivo) : round4(objetivo / factor);
  const comprobacion = round2(baseNueva * factor);

  const fila: FilaAjuste = {
    precioFinalActual:    finalActual,
    precioFinalPropuesto: objetivo,
    baseActual:           base,
    baseNueva,
    diferencia:           round2(objetivo - finalActual),
    verificado:           comprobacion === objetivo && baseNueva > 0,
  };
  if (!fila.verificado) {
    fila.motivoExclusion =
      `La base ${baseNueva} con ITBIS ${pctIva}% da ${comprobacion.toFixed(2)}, ` +
      `no ${objetivo.toFixed(2)} — no se puede alcanzar ese precio exacto`;
  }
  return fila;
}
