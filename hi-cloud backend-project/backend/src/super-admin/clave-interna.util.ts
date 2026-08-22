import { timingSafeEqual } from 'crypto';

/**
 * Autenticacion de las rutas internas que llama el script de respaldo.
 *
 * Vive aparte del controlador de super admin a proposito: esas rutas NO pasan
 * por SuperAdminGuard, y tener el helper en un archivo propio deja claro que es
 * un modelo de autenticacion distinto, no un detalle del panel.
 *
 * S-64: comparacion en tiempo constante y FALLA CERRADO. La version original
 * era `key !== process.env.INTERNAL_API_KEY`: si la variable no estaba definida,
 * un request sin el header comparaba `undefined !== undefined` → false, y la
 * peticion se daba por autorizada. Nunca dejar pasar por "no hay clave
 * configurada": sin clave, nadie entra.
 */
export function claveInternaValida(key?: string): boolean {
  const esperada = process.env.INTERNAL_API_KEY;
  if (!esperada || !key) return false;

  const a = Buffer.from(String(key));
  const b = Buffer.from(esperada);

  // Longitudes distintas: timingSafeEqual lanza si no coinciden, asi que se
  // corta antes. Filtra la longitud, no el contenido — que es lo que importa.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
