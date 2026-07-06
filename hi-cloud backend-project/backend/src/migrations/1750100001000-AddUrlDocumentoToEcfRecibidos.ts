import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUrlDocumentoToEcfRecibidos1750100001000 implements MigrationInterface {
  name = 'AddUrlDocumentoToEcfRecibidos1750100001000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE ecf_recibidos ADD COLUMN IF NOT EXISTS "urlDocumento" TEXT`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE ecf_recibidos DROP COLUMN IF EXISTS "urlDocumento"`);
  }
}
