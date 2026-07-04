import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenGracePeriod1750400000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // motivoRevocacion distingue rotación normal de logout/seguridad.
    // El grace period solo aplica a tokens revocados por 'rotacion'.
    await qr.query(`
      ALTER TABLE refresh_tokens
        ADD COLUMN IF NOT EXISTS "motivoRevocacion" VARCHAR(10),
        ADD COLUMN IF NOT EXISTS "nextTokenId"      VARCHAR(36)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE refresh_tokens
        DROP COLUMN IF EXISTS "motivoRevocacion",
        DROP COLUMN IF EXISTS "nextTokenId"
    `);
  }
}
