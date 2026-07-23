import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodigoBarrasToProductos1753510000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE productos
      ADD COLUMN IF NOT EXISTS "codigoBarras" varchar(100) NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE productos DROP COLUMN IF EXISTS "codigoBarras"`);
  }
}
