import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega lastActivityAt a refresh_tokens para el sistema de sesión única con confirmación.
 * Se actualiza con throttle de 5 minutos desde TenantMiddleware para no impactar el rendimiento.
 */
export class AddLastActivityAtToRefreshTokens1760500000000 implements MigrationInterface {
  name = 'AddLastActivityAtToRefreshTokens1760500000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE refresh_tokens
      ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMPTZ;
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE refresh_tokens
      DROP COLUMN IF EXISTS "lastActivityAt";
    `);
  }
}
