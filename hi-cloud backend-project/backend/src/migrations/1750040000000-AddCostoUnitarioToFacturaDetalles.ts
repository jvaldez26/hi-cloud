import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostoUnitarioToFacturaDetalles1750040000000 implements MigrationInterface {
  name = 'AddCostoUnitarioToFacturaDetalles1750040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE factura_detalles
        ADD COLUMN IF NOT EXISTS "costoUnitario" DECIMAL(14,4) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE factura_detalles DROP COLUMN IF EXISTS "costoUnitario"`);
  }
}
