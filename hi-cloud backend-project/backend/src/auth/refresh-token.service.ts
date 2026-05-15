import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private repo: Repository<RefreshToken>,
  ) {}

  /** Genera un refresh token aleatorio, lo guarda en BD y devuelve el valor en texto plano. */
  async crear(userId: number, deviceInfo?: string, ipAddress?: string): Promise<string> {
    const value = randomBytes(32).toString('hex');
    const hash  = this.hash(value);
    await this.repo.save(this.repo.create({
      userId,
      tokenHash:  hash,
      expiresAt:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
      deviceInfo: deviceInfo?.slice(0, 255),
      ipAddress:  ipAddress?.slice(0, 45),
    }));
    return value;
  }

  /** Valida el refresh token, lo rota y devuelve el userId si es válido. */
  async rotar(value: string, deviceInfo?: string, ipAddress?: string): Promise<{ userId: number; newRefreshValue: string }> {
    const hash = this.hash(value);
    const stored = await this.repo.findOne({ where: { tokenHash: hash, revokedAt: IsNull() } });

    if (!stored || stored.expiresAt < new Date()) {
      // Si el token expiró o no existe, intentar revocar para detectar reuse
      if (stored) await this.repo.update(stored.id, { revokedAt: new Date() });
      throw new UnauthorizedException('Sesión expirada. Por favor inicia sesión de nuevo.');
    }

    // Revocar el token usado (rotación)
    await this.repo.update(stored.id, { revokedAt: new Date() });

    // Crear nuevo refresh token
    const newValue = await this.crear(stored.userId, deviceInfo, ipAddress);
    return { userId: stored.userId, newRefreshValue: newValue };
  }

  /** Revoca todos los refresh tokens de un usuario (logout de todos los dispositivos). */
  async revocarTodos(userId: number): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Revoca un token específico por su valor en texto plano. */
  async revocarUno(value: string): Promise<void> {
    const hash = this.hash(value);
    await this.repo.update({ tokenHash: hash }, { revokedAt: new Date() });
  }

  /** Lista sesiones activas de un usuario (para "dispositivos conectados"). */
  async sesionesActivas(userId: number) {
    return this.repo.find({
      where: { userId, revokedAt: IsNull() },
      select: ['id', 'deviceInfo', 'ipAddress', 'createdAt', 'expiresAt'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Cron diario: elimina tokens expirados de la BD. */
  @Cron('0 3 * * *')
  async limpiarExpirados(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
