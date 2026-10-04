import type { AxiosError } from 'axios';

const SIN_CONEXION_DEFAULT   = 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
const ERROR_SERVIDOR_DEFAULT = 'Ocurrió un error. Intenta de nuevo en unos segundos.';

interface OpcionesMensajeError {
  /** Cuando el error NO tiene respuesta HTTP (red caída, timeout, DNS, servidor inalcanzable). */
  sinConexion?: string;
  /** Cuando sí hubo respuesta pero el status es 5xx — nunca el texto de negocio del backend. */
  errorServidor?: string;
  /** Solo si de verdad no hay ningún mensaje de negocio que mostrar (caso raro). */
  fallback?: string;
}

/**
 * Único punto para traducir un error de axios a un mensaje para el usuario.
 *
 * Caso real (login de yaribelnunez23@gmail.com, 2026-10-04): un error SIN
 * respuesta —red caída, timeout, DNS, típico al recién encender la PC—
 * caía en varias pantallas a un fallback fijo que INVENTABA una causa
 * ("Credenciales inválidas", "Código incorrecto", "Token inválido"...)
 * aunque el problema real fuera la conexión, no lo que la persona escribió
 * o el enlace que abrió. Mismo error para cualquier catch que use
 * `e?.response?.data?.algo ?? 'mensaje fijo'`: ese fallback dispara tanto
 * si el backend respondió sin ese campo como si nunca hubo respuesta.
 *
 * - Sin `err.response` (nunca hubo respuesta HTTP): mensaje de conexión.
 * - status >= 500: mensaje de "intenta de nuevo" — nunca el texto de
 *   negocio ("contraseña incorrecta", etc.), que solo aplica a errores de
 *   negocio reales.
 * - Lo demás (400/401/403/404/409/422...): el mensaje real que mandó
 *   el backend. `api/client.ts` ya lo deja en `err.friendlyMessage` para
 *   TODA respuesta de error, así que no hay que volver a parsear
 *   `response.data` aquí — pero se cae a `response.data.errors[0]`/
 *   `.message` igual, por si se llama con un error que no pasó por ese
 *   interceptor (p.ej. un `fetch` directo).
 * - 429 es la EXCEPCIÓN: api/client.ts sobreescribe `.friendlyMessage` con
 *   un texto genérico ("Demasiadas solicitudes...") para CUALQUIER 429,
 *   pero el bloqueo progresivo (login, modo supervisor) manda en
 *   `errors[0]` el mensaje real con el tiempo de espera exacto
 *   ("Demasiados intentos. Espera 5 minutos.") — se lee de ahí
 *   directamente, nunca de `friendlyMessage`, igual que ya hacía
 *   POSPage.tsx para verificar-supervisor antes de que existiera este
 *   helper.
 */
export function mensajeDeError(e: unknown, opciones: OpcionesMensajeError = {}): string {
  const err = e as (AxiosError & { friendlyMessage?: string; isNetworkError?: boolean }) | null | undefined;

  // api/client.ts marca isNetworkError en su interceptor; si el error no
  // pasó por ahí (fetch directo, etc.) se cae a comprobar !response.
  if (err?.isNetworkError ?? !err?.response) return opciones.sinConexion ?? SIN_CONEXION_DEFAULT;

  const status = err.response.status;
  if (typeof status === 'number' && status >= 500) {
    return opciones.errorServidor ?? ERROR_SERVIDOR_DEFAULT;
  }

  const data = err.response.data as any;
  const errorReal = Array.isArray(data?.errors) && typeof data.errors[0] === 'string' ? data.errors[0] : undefined;

  if (status === 429) {
    return errorReal ?? err.friendlyMessage ?? (typeof data?.message === 'string' ? data.message : undefined) ?? opciones.fallback ?? ERROR_SERVIDOR_DEFAULT;
  }

  return (
    err.friendlyMessage ??
    errorReal ??
    (typeof data?.message === 'string' ? data.message : undefined) ??
    opciones.fallback ??
    ERROR_SERVIDOR_DEFAULT
  );
}
