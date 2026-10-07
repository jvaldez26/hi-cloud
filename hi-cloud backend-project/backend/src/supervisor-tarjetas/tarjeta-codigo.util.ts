import { randomInt, createHash } from 'crypto';

/**
 * Prefijo fijo NUMÉRICO (2 dígitos) del código de tarjeta — distingue un
 * escaneo de tarjeta de supervisor de un escaneo de producto en el POS (ver
 * procesarScan en POSPage.tsx, frontend) y de cualquier otro código de
 * barras del sistema.
 *
 * Antes el código era alfanumérico (HSUP + 26 [A-Z0-9], Code128 Set B) — se
 * cambió a SOLO DÍGITOS (reporte real, 2026-10-07): con 30 caracteres
 * alfanuméricos el Code128 impreso en papel carta normal no se leía con un
 * escáner de caja (barras de ~0.2mm, se empastan en impresoras de oficina).
 * Solo dígitos permite Code Set C (2 dígitos por símbolo, la mitad de
 * módulos que Set B) — con eso el código completo cabe con un módulo de
 * 0.33mm+ y zona de silencio de sobra en el ancho de la tarjeta.
 *
 * "90" no choca con ningún código de producto real: un código de barras de
 * producto (EAN-13, UPC-A, EAN-8) mide 8-13 dígitos y un codigo/codigoBarras
 * interno de este sistema nunca llega a 24 — la LONGITUD por sí sola ya
 * descarta cualquier confusión, el prefijo es solo una capa extra.
 */
export const PREFIJO_TARJETA = '90';

/**
 * 22 dígitos aleatorios → log2(10^22) ≈ 73 bits de entropía. Junto con el
 * hash (nunca se guarda el código en claro) y el bloqueo progresivo por
 * intentos fallidos (SupervisorAttemptsService), es más que suficiente:
 * adivinar un código a fuerza bruta contra el bloqueo es inviable mucho
 * antes de agotar el espacio de búsqueda. Más el prefijo (2 dígitos), el
 * código completo mide 24 dígitos.
 */
const LONGITUD_ALEATORIA = 22;

function digitoAleatorio(): string {
  // randomInt es criptográficamente seguro (crypto.randomInt, no Math.random).
  return String(randomInt(10));
}

/** Genera un código de tarjeta nuevo — SOLO existe en memoria hasta que se usa (PDF) y se descarta. */
export function generarCodigoTarjeta(): string {
  let aleatorio = '';
  for (let i = 0; i < LONGITUD_ALEATORIA; i++) aleatorio += digitoAleatorio();
  return PREFIJO_TARJETA + aleatorio;
}

/**
 * SHA-256 hex del código completo — ver el comentario de
 * entities/tarjeta-supervisor.entity.ts sobre por qué no bcrypt.
 */
export function hashCodigoTarjeta(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}

/** Los últimos 4 dígitos — lo único que se vuelve a mostrar después de generarla ("Tarjeta ••••XXXX"). */
export function ultimosCuatro(codigo: string): string {
  return codigo.slice(-4);
}

/**
 * ¿El texto escaneado TIENE FORMA de tarjeta de supervisor? Se usa en dos
 * sitios con el MISMO criterio: el frontend (para no tratar un escaneo de
 * tarjeta como búsqueda de producto) y aquí mismo, antes de gastar un
 * intento de verificación en un código que ni siquiera tiene la forma
 * correcta (eso no debe contar para el bloqueo progresivo — fallar porque
 * alguien escaneó un producto por error no es un intento real contra una
 * tarjeta).
 */
export function esFormatoTarjeta(valor: string): boolean {
  return new RegExp(`^${PREFIJO_TARJETA}\\d{${LONGITUD_ALEATORIA}}$`).test(valor.trim());
}
