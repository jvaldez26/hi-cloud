import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuperAdminNotificadoToEcf1753100000000 implements MigrationInterface {
  name = 'AddSuperAdminNotificadoToEcf1753100000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE ecf
        ADD COLUMN IF NOT EXISTS "superAdminNotificado" boolean NOT NULL DEFAULT false
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE ecf DROP COLUMN IF EXISTS "superAdminNotificado"`);
  }
}
