/**
 * Parser de códigos de barras para balanzas etiquetadoras.
 *
 * ── Modelo de datos (longitudValor) ──────────────────────────────────────────
 * longitudValor = dígitos de valor PUROS — NO incluye el dígito verificador
 * interno. Cuando tieneCheckValor=true, hay una posición adicional separada.
 *
 * Geometría completa de un código:
 *   [prefijo] [PLU] [valor] [check_interno?] [check_EAN]
 *   .length    PLU   valor      0 o 1              1
 *
 * Invariante: prefijo.len + longitudPlu + longitudValor + (tieneCheckValor ? 1 : 0) + 1 = longitudTotal
 *
 * ── Ejemplo: Mettler Toledo estándar (EAN-13, check interno) ─────────────────
 *   prefijo='2'(1), PLU=5, valor=5, tieneCheckValor=true, longitudTotal=13
 *   → 1+5+5+1+1 = 13 ✅
 *   Código: '2' '00123' '04500' '9' (check_int) '0' (check_EAN)
 *           ─── ─────── ─────── ─             ─
 *           prefix  PLU  valor  cint          cean
 *
 * ── Ejemplo: Sin check interno (EAN-13) ─────────────────────────────────────
 *   prefijo='2'(1), PLU=5, valor=6, tieneCheckValor=false, longitudTotal=13
 *   → 1+5+6+0+1 = 13 ✅
 *
 * ── Primera línea de defensa ─────────────────────────────────────────────────
 * validarEAN() se evalúa ANTES de intentar cualquier patrón.
 * Si falla → el código se trata como producto normal (evita falsos positivos
 * con productos que tienen códigos EAN-13 iniciados en '2').
 *
 * ORDEN CORRECTO en el scanner del POS (a implementar en paso 5):
 *   1. Búsqueda exacta por codigoBarras / codigo en productos locales
 *      → si hay coincidencia: producto encontrado, flujo normal (FIN)
 *   2. Solo si no hay coincidencia exacta: intentar patrones de balanza
 *   3. Si tampoco: búsqueda remota
 *
 * @module balanza-parser
 */

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type TipoDatoBal = 'peso' | 'precio';

/** Patrón de decodificación tal como llega de la BD. */
export interface BalanzaPatronConfig {
  id:              number;
  prefijo:         string;        // '2', '20'…'29'
  longitudPlu:     number;        // 4, 5 o 6
  tipoDato:        TipoDatoBal;
  /** Dígitos de valor PUROS (sin incluir el check interno). */
  longitudValor:   number;        // 3–8
  decimalesValor:  number;        // 0–6
  unidadPeso?:     string;        // 'KG' | 'LB' | undefined si tipoDato='precio'
  tieneCheckValor: boolean;
  /** Longitud total del código: 12 (UPC-A) o 13 (EAN-13). */
  longitudTotal:   number;
  prioridad:       number;        // menor = mayor prioridad
}

/** Resultado de un parseo exitoso. */
export interface BalanzaParseResult {
  patron:     BalanzaPatronConfig;
  plu:        number;
  valor:      number;          // peso en kg/lb  O  precio en moneda local
  tipoDato:   TipoDatoBal;
  unidadPeso?: string;
}

/** Candidato generado por el asistente de calibración. */
export interface CandidatoPatron {
  prefijo:         string;
  longitudPlu:     number;
  tipoDato:        TipoDatoBal;
  /** Dígitos de valor PUROS (sin check interno). */
  longitudValor:   number;
  decimalesValor:  number;
  tieneCheckValor: boolean;
  longitudTotal:   number;
  plu:             number;
  valor:           number;
}

// ── Validación EAN (ISO/IEC 15420 mod-10) ────────────────────────────────────

/**
 * Calcula el dígito verificador EAN para los primeros n-1 dígitos de un código.
 */
export function calcularCheckEAN(cuerpo: string): number {
  let sum = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const d = parseInt(cuerpo[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Valida el dígito verificador EAN de un código EAN-13 (13 dígitos) o UPC-A (12 dígitos).
 */
export function validarEAN(codigo: string): boolean {
  if (!/^\d+$/.test(codigo))                         return false;
  if (codigo.length !== 12 && codigo.length !== 13)  return false;
  const cuerpo   = codigo.slice(0, -1);
  const esperado = calcularCheckEAN(cuerpo);
  const actual   = parseInt(codigo[codigo.length - 1], 10);
  return esperado === actual;
}

// ── Check interno del valor ───────────────────────────────────────────────────

/**
 * Valida el dígito verificador interno.
 * Algoritmo: suma de los dígitos de valorStr mod 10 = checkDigit.
 * (Implementación de dígito suma simple — la más extendida: CAS, Mettler Toledo, Dibal)
 *
 * @param valorStr   Dígitos puros del valor (sin el check)
 * @param checkDigit Dígito verificador (el que sigue a valorStr en el código)
 */
function validarCheckInterno(valorStr: string, checkDigit: number): boolean {
  const suma = valorStr.split('').reduce((s, d) => s + parseInt(d, 10), 0);
  return suma % 10 === checkDigit;
}

// ── Parseo principal ──────────────────────────────────────────────────────────

/**
 * Intenta decodificar un código de barras como etiqueta de balanza.
 *
 * Retorna null si:
 *  - El código no supera validación EAN  (→ tratarlo como producto normal)
 *  - Ningún patrón activo de la empresa coincide
 */
export function parsearCodigoBalanza(
  codigo:   string,
  patrones: BalanzaPatronConfig[],
): BalanzaParseResult | null {
  // ── PRIMERA LÍNEA DE DEFENSA ─────────────────────────────────────────────
  if (!validarEAN(codigo)) return null;

  const candidatos = [...patrones]
    .filter(p => p.longitudTotal === codigo.length)
    .sort((a, b) => a.prioridad - b.prioridad || a.id - b.id);

  for (const patron of candidatos) {
    // 1. Prefijo
    if (!codigo.startsWith(patron.prefijo)) continue;

    // 2. Sanity check de geometría del patrón
    //    Invariante: prefijo + PLU + valor + (tieneCheckValor ? 1 : 0) + 1 = total
    const totalEsperado =
      patron.prefijo.length + patron.longitudPlu + patron.longitudValor +
      (patron.tieneCheckValor ? 1 : 0) + 1;
    if (totalEsperado !== patron.longitudTotal) continue; // patrón mal configurado → saltar

    // 3. Extraer campos
    const pluStart   = patron.prefijo.length;
    const valorStart = pluStart + patron.longitudPlu;
    const valorEnd   = valorStart + patron.longitudValor; // fin de los dígitos puros de valor
    // Si tieneCheckValor: el check interno está en codigo[valorEnd]

    const pluStr   = codigo.substring(pluStart, valorStart);
    const valorStr = codigo.substring(valorStart, valorEnd);

    // 4. Validar check interno si el patrón lo requiere
    if (patron.tieneCheckValor) {
      const checkInterno = parseInt(codigo[valorEnd], 10);
      if (!validarCheckInterno(valorStr, checkInterno)) continue;
    }

    // 5. Extraer valor numérico
    const valorNum = parseInt(valorStr, 10) / Math.pow(10, patron.decimalesValor);

    // 6. Rechazar valores nulos, negativos o no finitos
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

// ── Asistente de calibración ──────────────────────────────────────────────────

const PREFIJOS_BALANZA = ['2', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'];
const PLU_LENGTHS      = [4, 5, 6];
const TIPOS_DATO       = ['peso', 'precio'] as const;
const DECIMALES_PESO   = [0, 1, 2, 3];
const DECIMALES_PRECIO = [0, 2];

/**
 * Genera todos los candidatos posibles para un código de barras dado.
 *
 * Paso 2 del asistente de calibración: el usuario escanea una etiqueta real
 * y esta función devuelve todas las interpretaciones compatibles con la
 * geometría del código y la validación EAN.
 *
 * IMPORTANTE: se necesitan al menos DOS etiquetas con valores diferentes
 * antes de confirmar un patrón, porque una sola etiqueta puede tener
 * múltiples interpretaciones geométricas válidas por casualidad.
 */
export function inferirPatrones(codigo: string): CandidatoPatron[] {
  if (!validarEAN(codigo)) return [];

  const n          = codigo.length;   // 12 o 13
  const payloadLen = n - 1;           // dígitos antes del check EAN
  const resultados: CandidatoPatron[] = [];
  const seen = new Set<string>();

  for (const pref of PREFIJOS_BALANZA) {
    if (!codigo.startsWith(pref)) continue;
    const restante = payloadLen - pref.length;

    for (const pluLen of PLU_LENGTHS) {
      const pluStr = codigo.substring(pref.length, pref.length + pluLen);

      for (const tipoDato of TIPOS_DATO) {
        const decOpts = tipoDato === 'peso' ? DECIMALES_PESO : DECIMALES_PRECIO;

        // ── Sin check interno ─────────────────────────────────────────────
        // total = pref + PLU + valor + 0 + 1  →  valorLen = restante - pluLen
        const valorLenSin = restante - pluLen;
        if (valorLenSin >= 3 && valorLenSin <= 8) {
          const valorStr = codigo.substring(pref.length + pluLen, pref.length + pluLen + valorLenSin);
          for (const dec of decOpts) {
            const valorNum = parseInt(valorStr, 10) / Math.pow(10, dec);
            if (valorNum <= 0) continue;
            const key = `${pref}|${pluLen}|${tipoDato}|${valorLenSin}|${dec}|false`;
            if (!seen.has(key)) {
              seen.add(key);
              resultados.push({
                prefijo: pref, longitudPlu: pluLen, tipoDato,
                longitudValor: valorLenSin, decimalesValor: dec,
                tieneCheckValor: false, longitudTotal: n,
                plu: parseInt(pluStr, 10), valor: valorNum,
              });
            }
          }
        }

        // ── Con check interno ─────────────────────────────────────────────
        // total = pref + PLU + valor + 1 + 1  →  valorLen = restante - pluLen - 1
        const valorLenCon = restante - pluLen - 1;
        if (valorLenCon >= 3 && valorLenCon <= 8) {
          const valorStr  = codigo.substring(pref.length + pluLen, pref.length + pluLen + valorLenCon);
          const checkPos  = pref.length + pluLen + valorLenCon;
          const checkDado = parseInt(codigo[checkPos], 10);
          if (validarCheckInterno(valorStr, checkDado)) {
            for (const dec of decOpts) {
              const valorNum = parseInt(valorStr, 10) / Math.pow(10, dec);
              if (valorNum <= 0) continue;
              const key = `${pref}|${pluLen}|${tipoDato}|${valorLenCon}|${dec}|true`;
              if (!seen.has(key)) {
                seen.add(key);
                resultados.push({
                  prefijo: pref, longitudPlu: pluLen, tipoDato,
                  longitudValor: valorLenCon, decimalesValor: dec,
                  tieneCheckValor: true, longitudTotal: n,
                  plu: parseInt(pluStr, 10), valor: valorNum,
                });
              }
            }
          }
        }
      }
    }
  }

  return resultados;
}

/**
 * Filtra candidatos usando los valores confirmados por el usuario.
 * Paso 3-4 del asistente de calibración.
 */
export function filtrarCandidatos(
  candidatos:    CandidatoPatron[],
  pluEsperado:   number,
  valorEsperado: number,
  tipoDato:      TipoDatoBal,
  tolerancia     = 0.001,
): CandidatoPatron[] {
  return candidatos.filter(c =>
    c.plu === pluEsperado &&
    c.tipoDato === tipoDato &&
    Math.abs(c.valor - valorEsperado) <= tolerancia,
  );
}

/**
 * Intersección de dos listas de candidatos — clave del asistente de
 * calibración de 2 etiquetas. Solo sobreviven los patrones que interpretan
 * CORRECTAMENTE ambas etiquetas escaneadas.
 *
 * Clave de identidad de patrón:
 *   prefijo | longitudPlu | tipoDato | longitudValor | decimalesValor | tieneCheckValor | longitudTotal
 */
export function intersectarCandidatos(
  lista1: CandidatoPatron[],
  lista2: CandidatoPatron[],
): CandidatoPatron[] {
  const claves2 = new Set(lista2.map(candidatoKey));
  return lista1.filter(c => claves2.has(candidatoKey(c)));
}

function candidatoKey(c: CandidatoPatron): string {
  return `${c.prefijo}|${c.longitudPlu}|${c.tipoDato}|${c.longitudValor}|${c.decimalesValor}|${c.tieneCheckValor}|${c.longitudTotal}`;
}
