import type { Request } from 'express';

/**
 * Punto de extracción único del JWT en requests HTTP entrantes.
 *
 * Orden de prioridad:
 *  1. Cookie httpOnly `access_token` (método principal desde S-23)
 *  2. Header `Authorization: Bearer <token>` (compat. API/Swagger/clientes externos)
 *
 * REGLA: Cualquier código que necesite leer el JWT de un request HTTP
 * debe usar ESTA función. Nunca leer req.cookies o req.headers.authorization
 * directamente — si cambia el transporte del JWT, solo hay un lugar que actualizar.
 */
export function extractJwtFromRequest(req: Request): string | null {
  // 1. Cookie httpOnly (se envía automáticamente por el navegador)
  const cookie = (req as any).cookies?.access_token as string | undefined;
  if (cookie) return cookie;

  // 2. Authorization Bearer (clientes API, Swagger, mobile, integraciones)
  const auth = req.headers?.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  return null;
}
