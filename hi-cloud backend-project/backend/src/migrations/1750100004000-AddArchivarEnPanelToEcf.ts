import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchivarEnPanelToEcf1750100004000 implements MigrationInterface {
  name = 'AddArchivarEnPanelToEcf1750100004000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE ecf
        ADD COLUMN IF NOT EXISTS "archivadoEnPanel" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "archivadoPorId"   int NULL,
        ADD COLUMN IF NOT EXISTS "archivadoEn"      TIMESTAMPTZ NULL
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ecf_archivadoEnPanel"
        ON ecf ("empresaId", "archivadoEnPanel")
        WHERE "isActive" = true
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "IDX_ecf_archivadoEnPanel"`);
    await qr.query(`ALTER TABLE ecf DROP COLUMN IF EXISTS "archivadoEnPanel"`);
    await qr.query(`ALTER TABLE ecf DROP COLUMN IF EXISTS "archivadoPorId"`);
    await qr.query(`ALTER TABLE ecf DROP COLUMN IF EXISTS "archivadoEn"`);
  }
}
