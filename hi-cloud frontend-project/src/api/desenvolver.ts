import type { AxiosResponse } from 'axios';

/**
 * Saca la carga útil de una respuesta del API.
 *
 * ── LA CONVENCIÓN ──────────────────────────────────────────────────────────
 *
 * El backend envuelve TODO con un interceptor global:
 *
 *     { success: true, data: <carga>, timestamp }
 *
 * Salvo los ~89 endpoints que usan `@Res()` —PDFs, descargas, redirects—, que
 * responden en crudo y no llevan envoltorio.
 *
 * Dentro de `data`, los endpoints paginados añaden otra capa, y ahí no hay una
 * sola forma: `{ data, meta }` en el núcleo del ERP y `{ data, total }` en los
 * módulos verticales. Este helper NO intenta arreglar eso — devuelve la carga
 * tal cual y el consumidor decide.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 *
 * `VideosTutorialesAdminPage` hacía `return res.data` a secas, así que recibía
 * el envoltorio entero, y el `.map()` de la tabla reventaba con
 * "T.map is not a function" justo después de un 200. El resto de la app usaba
 * `r.data?.data ?? r.data` copiado a mano en 169 sitios.
 */
export function desenvolver<T = any>(res: AxiosResponse<any>): T {
  const cuerpo = res?.data;

  // Sin envoltorio (respuestas de @Res()): se devuelve lo que haya.
  if (cuerpo == null || typeof cuerpo !== 'object') return cuerpo as T;

  // Solo se desenvuelve si tiene la forma EXACTA del envoltorio. Comprobar
  // únicamente que exista `data` desenvolvería de más un paginado
  // `{ data, meta }` que llegara sin envoltorio.
  const esEnvoltorio = 'success' in cuerpo && 'data' in cuerpo;
  return (esEnvoltorio ? cuerpo.data : cuerpo) as T;
}

/**
 * Igual que desenvolver(), pero GARANTIZA un array.
 *
 * ── POR QUÉ NO BASTA CON DESENVOLVER ───────────────────────────────────────
 *
 * Los dos bugs que motivaron esto no eran de desenvuelto: eran de que un
 * `.map()` recibió algo que no era un array. Un helper que solo desenvuelve
 * deja al siguiente consumidor expuesto exactamente igual — le entregaría un
 * objeto y el `.map()` volvería a reventar.
 *
 * Aquí la promesa es más fuerte: si pides un array, recibes un array. Nunca
 * `undefined`, nunca un objeto. Una lista vacía se pinta sola; un TypeError
 * deja la pantalla en blanco.
 *
 * Cubre también las dos formas de paginado —`{ data, ... }` e `{ items, ... }`—
 * porque un consumidor que pide "la lista" quiere las filas, no el sobre.
 */
export function desenvolverArray<T = any>(res: AxiosResponse<any>): T[] {
  const carga = desenvolver<any>(res);

  if (Array.isArray(carga)) return carga;

  if (carga && typeof carga === 'object') {
    if (Array.isArray(carga.data))  return carga.data;    // { data, meta } y { data, total }
    if (Array.isArray(carga.items)) return carga.items;   // { items, total }
  }

  // Ni array ni paginado conocido: lista vacía. Devolver `undefined` aquí
  // reproduciría el bug que este helper existe para evitar.
  return [];
}
