import type { Request } from 'express';

/**
 * IP real del cliente — mismo criterio que audit.interceptor.ts: prioriza
 * X-Forwarded-For (el proxy/load balancer real de producción va delante de
 * la app) y cae al socket directo si no hay header. Se extrae aparte porque
 * más de un módulo de auth (forzar logout, cierre de sesión de equipo)
 * necesita registrar desde qué IP se cerró la sesión de otra persona.
 */
export function obtenerIP(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined
  );
}
