/**
 * Parser de códigos de barras para balanzas etiquetadoras.
 *
 * ── Diseño ───────────────────────────────────────────────────────────────────
 * Módulo 100 % puro: sin dependencias de NestJS, TypeORM ni Node.js.
 * Se puede importar directamente desde el frontend o ejecutar en un worker.
 *
 * ── Geometría EAN-13 de balanza ──────────────────────────────────────────────
 *   [prefijo] [PLU] [valor_con_o_sin_check_interno] [check EAN]
 *   ──────────────────────────────────────────────── ──────────
 *   Posiciones 1 … (longitudTotal-1)                Última posición
 *
 *   Invariante de patrón válido:
 *   prefijo.length + longitudPlu + longitudValor + 1 = longitudTotal
 *
 * ── Primera línea de defensa ─────────────────────────────────────────────────
 * validarEAN() se evalúa ANTES de intentar cualquier patrón.
 * Si falla → el código pasa al lookup de producto normal.
 * Esto evita que un producto con código EAN-13 iniciado en '2' sea
 * interpretado erróneamente como etiqueta de balanza.
 *
 * ── Prioridad y resolución de conflictos ─────────────────────────────────────
 * Cuando dos patrones podrían coincidir con el mismo código, gana el de
 * menor valor en el campo `prioridad`. Empate: menor `id`.
 *
 * ── Check interno del valor ──────────────────────────────────────────────────
 * Cuando tieneCheckValor=true, el ÚLTIMO dígito de longitudValor es un
 * verificador de la balanza (no del EAN). Algoritmo: suma de los n-1
 * dígitos anteriores mod 10. Este es el más extendido (CAS, Mettler Toledo
 * en configuración estándar, Dibal). Si la marca usa otro algoritmo, basta
 * con registrar el patrón con tieneCheckValor=false y aumentar longitudValor.
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
  longitudValor:   number;        // incluye check interno si tieneCheckValor=true
  decimalesValor:  number;        // 0–6
  unidadPeso:      string | null; // 'KG' | 'LB' | null (si tipoDato='precio')
  tieneCheckValor: boolean;
  longitudTotal:   number;        // 12 (UPC-A) | 13 (EAN-13)
  prioridad:       number;        // menor = mayor prioridad
}

/** Resultado de un parseo exitoso. */
export interface BalanzaParseResult {
  patron:     BalanzaPatronConfig;
  plu:        number;
  valor:      number;          // peso en kg/lb  O  precio en moneda local
  tipoDato:   TipoDatoBal;
  unidadPeso: string | null;
}

/** Candidato generado por el asistente de calibración. */
export interface CandidatoPatron {
  prefijo:         string;
  longitudPlu:     number;
  tipoDato:        TipoDatoBal;
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
 * Algoritmo: posiciones impares (1-indexed) × 1, posiciones pares × 3. Suma mod 10.
 *
 * @param cuerpo  Primeros n-1 dígitos del código (sin el check digit final)
 */
export function calcularCheckEAN(cuerpo: string): number {
  let sum = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const d = parseInt(cuerpo[i], 10);
    // índice 0 = posición 1 (impar) → ×1; índice 1 = posición 2 (par) → ×3
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Valida el dígito verificador EAN de un código EAN-13 (13 dígitos) o UPC-A (12 dígitos).
 *
 * Retorna false si:
 *  - El código contiene caracteres no numéricos
 *  - La longitud no es 12 ni 13
 *  - El último dígito no coincide con el verificador calculado
 */
export function validarEAN(codigo: string): boolean {
  if (!/^\d+$/.test(codigo))                         return false;
  if (codigo.length !== 12 && codigo.length !== 13)  return false;
  const cuerpo   = codigo.slice(0, -1);
  const esperado = calcularCheckEAN(cuerpo);
  const actual   = parseInt(codigo[codigo.length - 1], 10);
  return esperado === actual;
}

// ── Check interno del valor (privado) ────────────────────────────────────────

/**
 * Valida el dígito verificador interno del campo de valor.
 * Algoritmo: suma de los primeros (n-1) dígitos mod 10 = último dígito.
 */
function validarCheckInterno(valorRaw: string): boolean {
  if (valorRaw.length < 2) return false;
  const cuerpo    = valorRaw.slice(0, -1);
  const checkDado = parseInt(valorRaw[valorRaw.length - 1], 10);
  const suma      = cuerpo.split('').reduce((s, d) => s + parseInt(d, 10), 0);
  return suma % 10 === checkDado;
}

// ── Parseo principal ──────────────────────────────────────────────────────────

/**
 * Intenta decodificar un código de barras como etiqueta de balanza.
 *
 * Retorna null si:
 *  - El código no supera validación EAN (→ el llamador lo trata como producto normal)
 *  - Ningún patrón activo de la empresa coincide
 *
 * @param codigo    Código escaneado (solo dígitos, 12 o 13 chars)
 * @param patrones  Lista de patrones activos de la empresa (isActive=true)
 */
export function parsearCodigoBalanza(
  codigo:   string,
  patrones: BalanzaPatronConfig[],
): BalanzaParseResult | null {
  // ── PRIMERA LÍNEA DE DEFENSA ─────────────────────────────────────────────
  if (!validarEAN(codigo)) return null;

  // Filtrar por longitud y ordenar: prioridad ASC, id ASC
  const candidatos = [...patrones]
    .filter(p => p.longitudTotal === codigo.length)
    .sort((a, b) => a.prioridad - b.prioridad || a.id - b.id);

  for (const patron of candidatos) {
    // 1. Verificar prefijo
    if (!codigo.startsWith(patron.prefijo)) continue;

    // 2. Sanity check de geometría del patrón (guarda contra datos corruptos en BD)
    const totalEsperado = patron.prefijo.length + patron.longitudPlu + patron.longitudValor + 1;
    if (totalEsperado !== patron.longitudTotal) continue;

    // 3. Extraer campos
    const pluStart   = patron.prefijo.length;
    const valorStart = pluStart + patron.longitudPlu;
    const valorEnd   = valorStart + patron.longitudValor;

    const pluStr   = codigo.substring(pluStart, pluStart + patron.longitudPlu);
    const valorRaw = codigo.substring(valorStart, valorEnd);

    // 4. Validar check interno si el patrón lo requiere
    if (patron.tieneCheckValor) {
      if (!validarCheckInterno(valorRaw)) continue;
    }

    // 5. Extraer valor numérico (excluir el byte de check si corresponde)
    const valorEffective = patron.tieneCheckValor ? valorRaw.slice(0, -1) : valorRaw;
    const valorNum       = parseInt(valorEffective, 10) / Math.pow(10, patron.decimalesValor);

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

const PREFIJOS_BALANZA  = ['2', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'];
const PLU_LENGTHS       = [4, 5, 6];
const TIPOS_DATO        = ['peso', 'precio'] as const;
const DECIMALES_PESO    = [0, 1, 2, 3];
const DECIMALES_PRECIO  = [0, 2];

/**
 * Paso 2 del asistente de calibración: genera todos los candidatos posibles
 * para un código dado. El usuario selecciona el que coincide con el PLU y
 * el peso/precio real del producto.
 *
 * Solo retorna candidatos cuyo código supera la validación EAN.
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
      const valorLen = restante - pluLen;
      if (valorLen < 3 || valorLen > 8) continue; // límites de sensatez

      const pluStr    = codigo.substring(pref.length, pref.length + pluLen);
      const valorFull = codigo.substring(pref.length + pluLen, pref.length + pluLen + valorLen);
      const pluNum    = parseInt(pluStr, 10);

      for (const tipoDato of TIPOS_DATO) {
        const decOpts = tipoDato === 'peso' ? DECIMALES_PESO : DECIMALES_PRECIO;
        for (const dec of decOpts) {
          // Sin check interno
          const valorNum = parseInt(valorFull, 10) / Math.pow(10, dec);
          if (valorNum > 0) {
            const key = `${pref}|${pluLen}|${tipoDato}|${valorLen}|${dec}|false`;
            if (!seen.has(key)) {
              seen.add(key);
              resultados.push({
                prefijo: pref, longitudPlu: pluLen, tipoDato,
                longitudValor: valorLen, decimalesValor: dec,
                tieneCheckValor: false, longitudTotal: n,
                plu: pluNum, valor: valorNum,
              });
            }
          }

          // Con check interno (necesita al menos 4 dígitos: 3 efectivos + 1 check)
          if (valorLen >= 4 && validarCheckInterno(valorFull)) {
            const valorSinCheck = parseInt(valorFull.slice(0, -1), 10) / Math.pow(10, dec);
            if (valorSinCheck > 0) {
              const key = `${pref}|${pluLen}|${tipoDato}|${valorLen}|${dec}|true`;
              if (!seen.has(key)) {
                seen.add(key);
                resultados.push({
                  prefijo: pref, longitudPlu: pluLen, tipoDato,
                  longitudValor: valorLen, decimalesValor: dec,
                  tieneCheckValor: true, longitudTotal: n,
                  plu: pluNum, valor: valorSinCheck,
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
 * Paso 3-4 del asistente: filtra candidatos usando los valores que el usuario
 * confirma (PLU del producto, peso/precio leído en la pantalla de la balanza).
 *
 * @param tolerancia  Margen aceptado para el valor (default 0.001, i.e. 1 gramo)
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
