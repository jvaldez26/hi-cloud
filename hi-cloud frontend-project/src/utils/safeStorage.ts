/**
 * Lectura/escritura segura de localStorage/sessionStorage con datos JSON.
 *
 * Incidente real (Sentry 7683266205, 2026-10-12): `user: Af ? JSON.parse(Af) :
 * null` en la inicialización del store de auth reventaba con "undefined" is
 * not valid JSON — localStorage tenía el string literal "undefined" en
 * `auth_user`. Como esa línea corre a nivel de MÓDULO (import de
 * auth.store.ts, antes de que React monte nada), el error nunca llegaba a un
 * try/catch de componente: la app entera quedaba en blanco, sin consola de
 * React, y el usuario no podía ni cerrar sesión para limpiar el dato.
 *
 * Nunca se encontró en el código actual un punto que escriba la cadena
 * "undefined" a propósito — probablemente un dato de una versión anterior ya
 * corregida, o localStorage manipulado a mano — pero da igual: ningún dato
 * guardado, sin importar cómo se haya corrompido, puede tumbar la carga de
 * la app. Todo acceso JSON a Storage pasa por aquí.
 */

import * as Sentry from '@sentry/react';

/** "undefined"/"null" no son JSON válido pero SÍ llegan a aparecer como contenido real guardado por error (ver cabecera). Se tratan como ausentes. */
const VALORES_AUSENTES = new Set(['undefined', 'null', '']);

/**
 * Lee y parsea una clave JSON. Si falta, está vacía, o el contenido no es
 * JSON válido (incluida la cadena literal "undefined"/"null"), devuelve
 * `null`, BORRA la clave corrupta (para no volver a tropezar con ella) y
 * avisa a Sentry con el nombre de la clave — nunca lanza.
 */
export function leerJSON<T>(storage: Storage, key: string): T | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    // Storage inaccesible (modo privado agresivo, política del navegador) — sin dato.
    return null;
  }
  if (raw == null || VALORES_AUSENTES.has(raw)) {
    if (raw != null) borrarClave(storage, key);
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    Sentry.captureMessage(`safeStorage: JSON inválido en "${key}", clave borrada`, {
      level: 'warning',
      extra: { key, rawPreview: raw.slice(0, 200) },
    });
    borrarClave(storage, key);
    return null;
  }
}

/**
 * Lee un valor de texto plano (no JSON) — mismo tratamiento de "undefined"/
 * "null" como ausente, para claves como `sucursalNombre` que se guardan sin
 * JSON.stringify.
 */
export function leerTexto(storage: Storage, key: string): string | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw == null || VALORES_AUSENTES.has(raw)) {
    if (raw != null) borrarClave(storage, key);
    return null;
  }
  return raw;
}

/**
 * Guarda un valor como JSON. `undefined`/`null` NUNCA se guardan como texto
 * ("undefined"/"null" el string) — en ese caso se borra la clave, que es lo
 * que significan como estado.
 */
export function guardarJSON(storage: Storage, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    borrarClave(storage, key);
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota excedida / storage bloqueado — no hay nada seguro que hacer aquí
    // además de no tumbar el flujo que llamó a guardar.
  }
}

/** Guarda texto plano — mismo criterio: undefined/null borra la clave. */
export function guardarTexto(storage: Storage, key: string, value: string | null | undefined): void {
  if (value == null) {
    borrarClave(storage, key);
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // Igual que guardarJSON — fallo de storage no debe tumbar el llamador.
  }
}

function borrarClave(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* storage inaccesible — nada que hacer */ }
}
