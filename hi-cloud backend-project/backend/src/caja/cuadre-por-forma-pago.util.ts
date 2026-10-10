/**
 * Cuadre de caja POR FORMA DE PAGO — incidente real (empresa 73, cajera
 * Bellamar González, 2026-10-09): el cierre solo cuadraba efectivo.
 * FAC-1803 se registró como Tarjeta 955 + Efectivo 125 cuando fue al
 * revés (Efectivo 955 + Tarjeta 125) — el efectivo contado dio "+829.94
 * SOBRANTE" (falso: era la tarjeta que faltaba, no dinero de más).
 *
 * `efectivo-esperado.util.ts` sigue siendo la ÚNICA fuente de verdad para
 * el efectivo — este archivo no lo reimplementa, lo consume como una fila
 * más del cuadre general.
 */

export interface FilaCuadre {
  forma: string;
  esperado: number;
  declarado: number;
  diferencia: number; // > 0 sobrante · < 0 faltante · 0 cuadra
}

/** Construye la tabla de cuadre — una fila por cada forma de pago presente en esperado o declarado. */
export function construirCuadrePorForma(
  esperadoPorForma: Record<string, number>,
  declaradoPorForma: Record<string, number>,
): FilaCuadre[] {
  const formas = new Set([...Object.keys(esperadoPorForma), ...Object.keys(declaradoPorForma)]);
  return [...formas].sort().map(forma => {
    const esperado = redondear(esperadoPorForma[forma] ?? 0);
    const declarado = redondear(declaradoPorForma[forma] ?? 0);
    return { forma, esperado, declarado, diferencia: redondear(declarado - esperado) };
  });
}

export interface SospechaFormaPago {
  formaSobrante: string;
  formaFaltante: string;
  /** Monto del sobrante (= |faltante|, dentro de la tolerancia). */
  monto: number;
}

/** Bucket del cuadre ↔ tipo(s) DGII de `formasPago`, para buscar facturas candidatas de una sospecha. */
export const TIPOS_DGII_POR_FORMA: Record<string, number[]> = {
  efectivo:      [1],
  transferencia: [2, 5],
  tarjeta:       [3],
  otros:         [4],
};

/**
 * Detecta pares sobrante/faltante que se cancelan aproximadamente — la
 * señal de que una factura se registró con las formas de pago cambiadas
 * entre sí, no de dinero real de más o de menos.
 *
 * `tolerancia` en pesos (configurable) — default RD$1, por redondeos de
 * centavos entre varias facturas.
 */
export function detectarPosibleFormaMalRegistrada(
  filas: FilaCuadre[], tolerancia = 1,
): SospechaFormaPago[] {
  const sospechas: SospechaFormaPago[] = [];
  const sobrantes = filas.filter(f => f.diferencia > 0.01);
  const faltantes = filas.filter(f => f.diferencia < -0.01);
  for (const sob of sobrantes) {
    for (const falt of faltantes) {
      if (Math.abs(sob.diferencia + falt.diferencia) <= tolerancia) {
        sospechas.push({ formaSobrante: sob.forma, formaFaltante: falt.forma, monto: sob.diferencia });
      }
    }
  }
  return sospechas;
}

/** Neto de todas las diferencias — si es ~0 pero hay sospechas, confirma que es un error de registro, no una pérdida real. */
export function netoCuadre(filas: FilaCuadre[]): number {
  return redondear(filas.reduce((a, f) => a + f.diferencia, 0));
}

function redondear(n: number): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
