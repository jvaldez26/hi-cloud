import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Bloqueo progresivo por intentos fallidos de login.
 * Clave: email (normalizado) + IP — cada combinación tiene su propio contador.
 * Usa CACHE_MANAGER (Redis en producción) para persistir contadores y bloqueos.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  private attemptsKey(email: string, ip: string): string {
    return `login_attempts:${email.toLowerCase()}:${ip}`;
  }

  private blockedKey(email: string, ip: string): string {
    return `login_blocked:${email.toLowerCase()}:${ip}`;
  }

  async isBlocked(email: string, ip: string): Promise<{ blocked: boolean; remainingSeconds?: number }> {
    const data = await this.cache.get<{ blockedUntil: number }>(this.blockedKey(email, ip));
    if (data && data.blockedUntil > Date.now()) {
      return { blocked: true, remainingSeconds: Math.ceil((data.blockedUntil - Date.now()) / 1000) };
    }
    return { blocked: false };
  }

  async increment(email: string, ip: string): Promise<number> {
    const key     = this.attemptsKey(email, ip);
    const current = (await this.cache.get<number>(key)) ?? 0;
    const newVal  = current + 1;
    await this.cache.set(key, newVal, 86_400_000); // 24h en ms
    return newVal;
  }

  async reset(email: string, ip: string): Promise<void> {
    await this.cache.del(this.attemptsKey(email, ip));
    await this.cache.del(this.blockedKey(email, ip));
  }

  async block(email: string, ip: string, attempts: number): Promise<number> {
    const blockSeconds = this.getBlockDuration(attempts);
    if (blockSeconds > 0) {
      const blockedUntil = Date.now() + blockSeconds * 1000;
      await this.cache.set(this.blockedKey(email, ip), { blockedUntil }, blockSeconds * 1000);
    }
    return blockSeconds;
  }

  getBlockDuration(attempts: number): number {
    if (attempts <= 3) return 0;
    if (attempts === 4) return 60;
    if (attempts === 5) return 300;
    if (attempts === 6) return 900;
    if (attempts === 7) return 1800;
    return 3600;
  }

  formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds} segundos`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutos`;
    return `${Math.ceil(seconds / 3600)} hora(s)`;
  }
}
