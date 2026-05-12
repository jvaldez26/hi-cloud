/**
 * HiCloud ERP — Autenticación en dos factores (TOTP)
 * Usa speakeasy (RFC 6238) compatible con Google Authenticator y Authy.
 */
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { User } from '../users/users.entity';

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

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

  /** Activa 2FA tras verificar que el usuario escanió correctamente el QR */
  async activar(userId: number, codigo: string): Promise<void> {
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
    await this.userRepo.update(userId, { twoFactorEnabled: true });
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

  /** Verifica el código TOTP durante el login */
  async verificarCodigo(userId: number, codigo: string): Promise<boolean> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.twoFactorSecret')
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!user?.twoFactorSecret) return false;
    return speakeasy.totp.verify({
      secret:   user.twoFactorSecret,
      encoding: 'base32',
      token:    codigo,
      window:   1,
    });
  }

  /** Retorna si el usuario tiene 2FA activo */
  async getStatus(userId: number): Promise<{ enabled: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return { enabled: user?.twoFactorEnabled ?? false };
  }
}
