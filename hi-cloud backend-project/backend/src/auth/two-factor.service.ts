/**
 * HiCloud ERP — Autenticación en dos factores (TOTP)
 * Usa speakeasy (RFC 6238) compatible con Google Authenticator y Authy.
 */
import { Injectable, BadRequestException, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { User } from '../users/users.entity';

@Injectable()
export class TwoFactorService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectDataSource() private ds: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.ds.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" JSONB`
      );
    } catch { /* ignorar si ya existe */ }
  }

  private hashBackupCode(code: string): string {
    return createHash('sha256').update(code.toUpperCase()).digest('hex');
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: 8 }, () =>
      `${randomBytes(2).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`
    );
  }

  /** Genera un nuevo secret TOTP y devuelve la URI + QR data URL */
  async generarSecreto(userId: number): Promise<{ secret: string; qrDataUrl: string; otpauthUrl: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const secretObj = speakeasy.generateSecret({
      name:   `HiCloud ERP (${user.email})`,
      issuer: 'HiCloud ERP',
      length: 20,
    });

    const secret      = secretObj.base32;
    const otpauthUrl  = secretObj.otpauth_url ?? '';

    // Guardar secreto temporalmente (no activado hasta confirmación con código)
    await this.userRepo.update(userId, { twoFactorSecret: secret, twoFactorEnabled: false });

    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    return { secret, qrDataUrl, otpauthUrl };
  }

  /** Activa 2FA y genera códigos de respaldo */
  async activar(userId: number, codigo: string): Promise<{ backupCodes: string[] }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.twoFactorSecret')
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!user?.twoFactorSecret) {
      throw new BadRequestException('Primero genera el código QR');
    }

    const valido = speakeasy.totp.verify({
      secret:   user.twoFactorSecret,
      encoding: 'base32',
      token:    codigo,
      window:   1,
    });

    if (!valido) throw new UnauthorizedException('Código incorrecto');

    const plainCodes  = this.generateBackupCodes();
    const hashedCodes = plainCodes.map(c => this.hashBackupCode(c));

    await this.ds.query(
      `UPDATE users SET "twoFactorEnabled" = true, "twoFactorBackupCodes" = $1 WHERE id = $2`,
      [JSON.stringify(hashedCodes), userId],
    );

    return { backupCodes: plainCodes };
  }

  /** Desactiva 2FA */
  async desactivar(userId: number, codigo: string): Promise<void> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.twoFactorSecret')
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA no está activado');
    }

    const valido = speakeasy.totp.verify({
      secret:   user.twoFactorSecret,
      encoding: 'base32',
      token:    codigo,
      window:   1,
    });

    if (!valido) throw new UnauthorizedException('Código incorrecto');
    await this.userRepo.update(userId, { twoFactorEnabled: false, twoFactorSecret: undefined });
  }

  /** Verifica el código TOTP o un código de respaldo durante el login */
  async verificarCodigo(userId: number, codigo: string): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT "twoFactorSecret", "twoFactorBackupCodes" FROM users WHERE id = $1`,
      [userId],
    );
    const row = rows[0];
    if (!row?.twoFactorSecret) return false;

    // TOTP normal
    if (speakeasy.totp.verify({ secret: row.twoFactorSecret, encoding: 'base32', token: codigo, window: 1 })) {
      return true;
    }

    // Código de respaldo (uso único)
    const backupCodes: string[] = row.twoFactorBackupCodes ?? [];
    const hash = this.hashBackupCode(codigo);
    const idx  = backupCodes.indexOf(hash);
    if (idx === -1) return false;

    // Consumir el código (no puede reutilizarse)
    const remaining = [...backupCodes];
    remaining.splice(idx, 1);
    await this.ds.query(
      `UPDATE users SET "twoFactorBackupCodes" = $1 WHERE id = $2`,
      [JSON.stringify(remaining), userId],
    );
    return true;
  }

  /** Retorna si el usuario tiene 2FA activo */
  async getStatus(userId: number): Promise<{ enabled: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return { enabled: user?.twoFactorEnabled ?? false };
  }
}
