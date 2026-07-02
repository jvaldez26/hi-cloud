import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRncCompradorToFacturas1750380000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE facturas
      ADD COLUMN IF NOT EXISTS "rncComprador" VARCHAR(11) NULL DEFAULT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE facturas DROP COLUMN IF EXISTS "rncComprador"`);
  }
}
