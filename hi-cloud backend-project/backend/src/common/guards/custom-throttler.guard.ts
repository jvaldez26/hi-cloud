import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

/**
 * ThrottlerGuard personalizado que lee la IP real del cliente
 * desde los headers X-Real-IP o X-Forwarded-For que Nginx propaga.
 *
 * Sin esto, req.ip siempre es 127.0.0.1 (IP de Nginx) y todos los
 * usuarios comparten el mismo bucket de throttling — un usuario
 * con muchos intentos bloquea a todos los demás.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const realIp   = req.headers?.['x-real-ip'] as string | undefined;
    const forwarded = req.headers?.['x-forwarded-for'] as string | undefined;
    // Nginx pone la IP real del cliente en X-Real-IP (más confiable).
    // X-Forwarded-For puede tener varias IPs separadas por coma si hay varios proxies.
    const clientIp = realIp?.trim()
      ?? forwarded?.split(',')[0]?.trim()
      ?? (req.ip as string | undefined)
      ?? 'unknown';
    return clientIp;
  }
}
