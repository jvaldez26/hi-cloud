/**
 * balanza-scan.ts — Parser de etiquetas EAN-13/UPC-A de balanzas, para el POS.
 *
 * Replica la lógica del backend (balanza-parser.ts) directamente en el cliente,
 * así el intercept del scanner opera sobre los patrones cacheados (sin red).
 *
 * Geometría invariante (ver backend para spec completa):
 *   prefijo.len + longitudPlu + longitudValor + (tieneCheckValor ? 1 : 0) + 1 = longitudTotal
 *
 * longitudValor = dígitos de valor PUROS (sin incluir el check interno).
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type TipoDatoBalanza = 'peso' | 'precio';

/** Patrón tal como viene del endpoint /balanza/patrones (ya filtrado a isActive=true). */
export interface BalanzaPatronFrontend {
  id:              number;
  nombre:          string;
  prefijo:         string;
  longitudPlu:     number;
  tipoDato:        TipoDatoBalanza;
  /** Dígitos de valor PUROS — NO incluye el check interno. */
  longitudValor:   number;
  decimalesValor:  number;
  unidadPeso?:     string;
  tieneCheckValor: boolean;
  longitudTotal:   number;
  prioridad:       number;
}

/** Resultado de un parseo exitoso. */
export interface BalanzaMatchFrontend {
  patron:     BalanzaPatronFrontend;
  plu:        number;
  /** Peso (kg/lb) o precio, según patron.tipoDato. */
  valor:      number;
  tipoDato:   TipoDatoBalanza;
  unidadPeso?: string;
}

// ── Validación EAN ────────────────────────────────────────────────────────────

function calcularCheckEAN(cuerpo: string): number {
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const d = parseInt(cuerpo[i], 10);
    suma += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (suma % 10)) % 10;
}

/**
 * Valida el dígito verificador EAN-13 / UPC-A.
 * Retorna false si el código no tiene 12 o 13 dígitos numéricos.
 */
export function validarEAN(codigo: string): boolean {
  if (codigo.length !== 12 && codigo.length !== 13) return false;
  if (!/^\d+$/.test(codigo)) return false;
  const cuerpo = codigo.slice(0, -1);
  const check  = parseInt(codigo.slice(-1), 10);
  return calcularCheckEAN(cuerpo) === check;
}

// ── Check interno ─────────────────────────────────────────────────────────────

/** Verifica el check interno de la balanza: suma de dígitos de valor mod 10. */
function validarCheckInterno(valorStr: string, checkDigit: number): boolean {
  const suma = valorStr.split('').reduce((s, d) => s + parseInt(d, 10), 0);
  return suma % 10 === checkDigit;
}

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Intenta decodificar `codigo` usando los patrones de balanza cacheados.
 *
 * Orden: prioridad ASC, id ASC (coincide con el backend).
 * Retorna null si el código no pasa EAN o ningún patrón coincide.
 */
export function parsearBalanza(
  codigo:   string,
  patrones: BalanzaPatronFrontend[],
): BalanzaMatchFrontend | null {
  if (!validarEAN(codigo)) return null;
  if (!patrones.length) return null;

  const candidatos = patrones
    .filter(p => codigo.startsWith(p.prefijo) && codigo.length === p.longitudTotal)
    .sort((a, b) => a.prioridad !== b.prioridad ? a.prioridad - b.prioridad : a.id - b.id);

  for (const patron of candidatos) {
    // Validar geometría internamente (por si un patrón tiene una migración corrupta)
    const bonus    = patron.tieneCheckValor ? 1 : 0;
    const esperado = patron.prefijo.length + patron.longitudPlu + patron.longitudValor + bonus + 1;
    if (esperado !== patron.longitudTotal) continue;

    const pluStart   = patron.prefijo.length;
    const valorStart = pluStart + patron.longitudPlu;
    const valorEnd   = valorStart + patron.longitudValor;

    const pluStr   = codigo.substring(pluStart, valorStart);
    const valorStr = codigo.substring(valorStart, valorEnd);

    // Validar check interno si aplica
    if (patron.tieneCheckValor) {
      const checkInterno = parseInt(codigo[valorEnd], 10);
      if (!validarCheckInterno(valorStr, checkInterno)) continue;
    }

    const valorNum = parseInt(valorStr, 10) / Math.pow(10, patron.decimalesValor);
    if (!isFinite(valorNum) || valorNum <= 0) continue;

    return {
      patron,
      plu:        parseInt(pluStr, 10),
      valor:      valorNum,
      tipoDato:   patron.tipoDato,
      unidadPeso: patron.unidadPeso,
    };
  }

  return null;
}
