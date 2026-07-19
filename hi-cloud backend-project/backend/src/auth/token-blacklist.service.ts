import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(private readonly ds: DataSource) {}

  /** Añade el jti a la blacklist hasta que el token expire. */
  async blacklist(jti: string, expiresAt: number): Promise<void> {
    const expiresDate = new Date(expiresAt * 1000);
    await this.ds.query(
      `INSERT INTO token_blacklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [jti, expiresDate],
    );
  }

  /** Devuelve true si el token está en la blacklist. */
  async isBlacklisted(jti: string | undefined): Promise<boolean> {
    // M-1: token sin jti no es revocable → tratar como inválido (fail-closed)
    if (!jti) return true;
    const rows = await this.ds.query<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM token_blacklist WHERE jti = $1 AND expires_at > NOW()) AS exists`,
      [jti],
    );
    return rows[0]?.exists === true;
  }

  /** Genera un jti único para incluir en el payload JWT. */
  static generateJti(): string {
    return randomUUID();
  }

  /** Limpia tokens expirados a las 3am UTC. */
  @Cron('0 3 * * *')
  async limpiarExpirados(): Promise<void> {
    const result = await this.ds.query(
      `DELETE FROM token_blacklist WHERE expires_at < NOW()`,
    );
    this.logger.log(`Blacklist limpiada: ${result?.[1] ?? 0} tokens expirados eliminados`);
  }
}
