import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarcaModeloReferenciaToProductos1753400000000 implements MigrationInterface {
  name = 'AddMarcaModeloReferenciaToProductos1753400000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS marca      VARCHAR(100) NULL DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS modelo     VARCHAR(100) NULL DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS referencia VARCHAR(100) NULL DEFAULT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE productos
        DROP COLUMN IF EXISTS marca,
        DROP COLUMN IF EXISTS modelo,
        DROP COLUMN IF EXISTS referencia
    `);
  }
}
