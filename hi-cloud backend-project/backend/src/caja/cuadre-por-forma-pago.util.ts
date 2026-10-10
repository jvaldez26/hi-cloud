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
  /**
   * @deprecated usar montoSobrante/montoFaltante — este campo asumía que
   * ambos valores eran simétricos (|sobrante| = |faltante|), lo que casi
   * nunca es exacto (caso real: +829.94 / -830.00, una diferencia de 0.06
   * dentro de tolerancia pero no idéntica). Se mantiene solo por
   * compatibilidad con código que ya lo lea.
   */
  monto: number;
  /** Monto real del sobrante (> 0). */
  montoSobrante: number;
  /** Monto real del faltante (< 0) — NUNCA se asume igual a -montoSobrante. */
  montoFaltante: number;
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
        sospechas.push({
          formaSobrante: sob.forma, formaFaltante: falt.forma,
          monto: sob.diferencia, // compat
          montoSobrante: sob.diferencia, montoFaltante: falt.diferencia,
        });
      }
    }
  }
  return sospechas;
}

/** Neto de todas las diferencias — si es ~0 pero hay sospechas, confirma que es un error de registro, no una pérdida real. */
export function netoCuadre(filas: FilaCuadre[]): number {
  return redondear(filas.reduce((a, f) => a + f.diferencia, 0));
}

/** Inverso de TIPOS_DGII_POR_FORMA — tipo DGII → la forma del cuadre a la que pertenece. */
const FORMA_POR_TIPO_DGII: Record<number, string> = Object.fromEntries(
  Object.entries(TIPOS_DGII_POR_FORMA).flatMap(([forma, tipos]) => tipos.map(t => [t, forma])),
);

/**
 * Deriva el cuadre por forma de pago para un cierre VIEJO que se cerró antes
 * de que este cuadre existiera — a partir de las columnas que YA se
 * guardaban (ventasTarjeta/ventasTransferencia/ventasCredito/saldoCierre/
 * saldoFisico/desglosePago). Nunca se persiste: es un "mejor esfuerzo"
 * calculado al leer, para que un cierre antiguo también muestre la tabla en
 * vez de forzar al usuario a revisarlo a mano. `desglosePago` es el campo
 * libre (string→string) que ya existía — sus claves tarjetaCredito/
 * tarjetaDebito (anteriores a la unificación) se suman al bucket 'tarjeta'.
 */
export function derivarCuadreLegacy(campos: {
  saldoCierre: number; saldoFisico: number;
  ventasTarjeta: number; ventasTransferencia: number; ventasCredito?: number;
  desglosePago?: Record<string, string | number> | null;
}): FilaCuadre[] {
  const dp = campos.desglosePago ?? {};
  const n = (k: string) => Number(dp[k] ?? 0);

  const esperadoPorForma = {
    efectivo:      Number(campos.saldoCierre ?? 0),
    tarjeta:       Number(campos.ventasTarjeta ?? 0),
    transferencia: Number(campos.ventasTransferencia ?? 0),
    otros:         Number(campos.ventasCredito ?? 0),
  };
  const declaradoPorForma = {
    efectivo:      Number(campos.saldoFisico ?? 0),
    tarjeta:       n('tarjeta') + n('tarjetaCredito') + n('tarjetaDebito'),
    transferencia: n('transferencia') + n('cheque') + n('deposito'),
    otros:         n('otro') + n('documentos'),
  };
  return construirCuadrePorForma(esperadoPorForma, declaradoPorForma);
}

/**
 * Cuadre CORREGIDO — el cierre original (snapshot) nunca se reescribe, pero
 * cuando una factura de ese turno se corrigió DESPUÉS de cerrar (ver
 * ajustes_cierre_caja / registrarAjusteSiCierreCerrado en caja.service.ts),
 * el reporte debe poder mostrar "así hubiera cuadrado si la forma de pago
 * hubiera estado bien desde el principio" junto al original. Cada ajuste
 * resta su `formasPagoAnterior` y suma su `formasPagoNuevo` al ESPERADO de
 * la forma correspondiente — el declarado nunca cambia (es lo que la cajera
 * contó físicamente, eso no se altera por una corrección de papeleo).
 */
export function aplicarAjustesAlCuadre(
  cuadreOriginal: FilaCuadre[],
  ajustes: { formasPagoAnterior: { tipo: number; monto: number }[]; formasPagoNuevo: { tipo: number; monto: number }[] }[],
): FilaCuadre[] {
  const esperadoPorForma: Record<string, number> = {};
  const declaradoPorForma: Record<string, number> = {};
  for (const fila of cuadreOriginal) {
    esperadoPorForma[fila.forma]  = fila.esperado;
    declaradoPorForma[fila.forma] = fila.declarado;
  }

  for (const ajuste of ajustes) {
    for (const fp of ajuste.formasPagoAnterior) {
      const forma = FORMA_POR_TIPO_DGII[fp.tipo];
      if (forma) esperadoPorForma[forma] = (esperadoPorForma[forma] ?? 0) - Number(fp.monto || 0);
    }
    for (const fp of ajuste.formasPagoNuevo) {
      const forma = FORMA_POR_TIPO_DGII[fp.tipo];
      if (forma) esperadoPorForma[forma] = (esperadoPorForma[forma] ?? 0) + Number(fp.monto || 0);
    }
  }

  return construirCuadrePorForma(esperadoPorForma, declaradoPorForma);
}

function redondear(n: number): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
