import { randomInt, createHash } from 'crypto';

/**
 * Prefijo fijo del código de tarjeta — distingue un escaneo de tarjeta de
 * supervisor de un escaneo de producto en el POS (ver procesarScan en
 * POSPage.tsx, frontend) y de cualquier otro código de barras del sistema.
 */
export const PREFIJO_TARJETA = 'HSUP';

/**
 * Alfabeto SOLO letras mayúsculas y números, sin guiones ni símbolos: un
 * guion se convertía en apóstrofe con un escáner en layout US y el SO en
 * es-DO (bug real, ya vivido con otro código de barras de este proyecto).
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * 26 caracteres aleatorios de un alfabeto de 36 → log2(36)×26 ≈ 134 bits de
 * entropía, por encima del mínimo de 128 bits pedido. Más el prefijo fijo
 * (4 chars), el código completo mide 30 caracteres.
 */
const LONGITUD_ALEATORIA = 26;

function caracterAleatorio(): string {
  // randomInt es criptográficamente seguro (crypto.randomInt, no Math.random).
  return ALFABETO[randomInt(ALFABETO.length)];
}

/** Genera un código de tarjeta nuevo — SOLO existe en memoria hasta que se usa (PDF) y se descarta. */
export function generarCodigoTarjeta(): string {
  let aleatorio = '';
  for (let i = 0; i < LONGITUD_ALEATORIA; i++) aleatorio += caracterAleatorio();
  return PREFIJO_TARJETA + aleatorio;
}

/**
 * SHA-256 hex del código completo — ver el comentario de
 * entities/tarjeta-supervisor.entity.ts sobre por qué no bcrypt.
 */
export function hashCodigoTarjeta(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}

/** Los últimos 4 caracteres — lo único que se vuelve a mostrar después de generarla ("Tarjeta ••••XXXX"). */
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
  return new RegExp(`^${PREFIJO_TARJETA}[A-Z0-9]{${LONGITUD_ALEATORIA}}$`).test(valor.trim());
}
