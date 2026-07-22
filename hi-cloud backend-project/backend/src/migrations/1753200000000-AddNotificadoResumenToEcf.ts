import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificadoResumenToEcf1753200000000 implements MigrationInterface {
  name = 'AddNotificadoResumenToEcf1753200000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE ecf
        ADD COLUMN IF NOT EXISTS "notificadoResumen" boolean NOT NULL DEFAULT false
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE ecf DROP COLUMN IF EXISTS "notificadoResumen"`);
  }
}
