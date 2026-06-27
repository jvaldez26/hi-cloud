import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostoToProductos1750350000000 implements MigrationInterface {
  name = 'AddCostoToProductos1750350000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo DECIMAL(12,2) NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE productos DROP COLUMN IF EXISTS costo`);
  }
}
