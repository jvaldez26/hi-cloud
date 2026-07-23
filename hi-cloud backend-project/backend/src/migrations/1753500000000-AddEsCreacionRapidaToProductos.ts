import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEsCreacionRapidaToProductos1753500000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE productos
      ADD COLUMN IF NOT EXISTS "esCreacionRapida" boolean NOT NULL DEFAULT false
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE productos DROP COLUMN IF EXISTS "esCreacionRapida"`);
  }
}
