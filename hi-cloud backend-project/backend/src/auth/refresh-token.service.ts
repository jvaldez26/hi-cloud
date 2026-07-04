import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { RefreshToken } from './entities/refresh-token.entity';

const GRACE_PERIOD_MS = 15_000; // 15 s — ventana para race condition multi-pestaña

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private repo: Repository<RefreshToken>,
  ) {}

  /** Genera un refresh token aleatorio, lo guarda en BD y devuelve el valor en texto plano. */
  async crear(userId: number, deviceInfo?: string, ipAddress?: string): Promise<string> {
    return (await this.crearRegistro(userId, deviceInfo, ipAddress)).value;
  }

  /** Valida el refresh token, lo rota y devuelve el userId + nuevo valor. */
  async rotar(
    value: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<{ userId: number; newRefreshValue: string }> {
    const hash = this.hash(value);

    // ── Caso normal: token activo ─────────────────────────────────────────────
    const stored = await this.repo.findOne({ where: { tokenHash: hash, revokedAt: IsNull() } });

    if (stored) {
      if (stored.expiresAt < new Date()) {
        await this.repo.update(stored.id, { revokedAt: new Date(), motivoRevocacion: 'rotacion' });
        throw new UnauthorizedException('Sesión expirada. Por favor inicia sesión de nuevo.');
      }

      // Crear el token nuevo primero para obtener su ID (necesario para nextTokenId)
      const { id: newId, value: newValue } = await this.crearRegistro(
        stored.userId,
        deviceInfo,
        ipAddress,
      );

      // Revocar el viejo con referencia al nuevo (permite grace period multi-pestaña)
      await this.repo.update(stored.id, {
        revokedAt:        new Date(),
        motivoRevocacion: 'rotacion',
        nextTokenId:      newId,
      });

      return { userId: stored.userId, newRefreshValue: newValue };
    }

    // ── Grace period: race condition multi-pestaña ────────────────────────────
    // Si el token fue revocado por ROTACIÓN hace menos de GRACE_PERIOD_MS, otra
    // pestaña ya lo rotó. Emitimos un nuevo token sin revocar el sucesor (que
    // la otra pestaña ya está usando).
    const revocado = await this.repo.findOne({ where: { tokenHash: hash } });

    if (
      revocado?.motivoRevocacion === 'rotacion' &&
      revocado.revokedAt &&
      Date.now() - revocado.revokedAt.getTime() < GRACE_PERIOD_MS
    ) {
      const newValue = await this.crear(revocado.userId, deviceInfo, ipAddress);
      return { userId: revocado.userId, newRefreshValue: newValue };
    }

    // ── Revocado por logout / seguridad / expirado → siempre rechazar ─────────
    throw new UnauthorizedException('Sesión expirada. Por favor inicia sesión de nuevo.');
  }

  /** Revoca todos los refresh tokens de un usuario (logout). */
  async revocarTodos(userId: number): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date(), motivoRevocacion: 'logout' },
    );
  }

  /** Revoca un token específico por su valor en texto plano. */
  async revocarUno(
    value: string,
    motivo: 'rotacion' | 'logout' | 'seguridad' = 'logout',
  ): Promise<void> {
    const hash = this.hash(value);
    await this.repo.update({ tokenHash: hash }, { revokedAt: new Date(), motivoRevocacion: motivo });
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

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async crearRegistro(
    userId: number,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<{ id: string; value: string }> {
    const value  = randomBytes(32).toString('hex');
    const hash   = this.hash(value);
    const entity = await this.repo.save(
      this.repo.create({
        userId,
        tokenHash:  hash,
        expiresAt:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
        deviceInfo: deviceInfo?.slice(0, 255),
        ipAddress:  ipAddress?.slice(0, 45),
      }),
    );
    return { id: entity.id, value };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
