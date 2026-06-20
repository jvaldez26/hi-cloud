import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescuentoMontoToFacturaDetalles1750230000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "factura_detalles"
        ADD COLUMN IF NOT EXISTS "descuentoMonto" NUMERIC(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "factura_detalles"
        DROP COLUMN IF EXISTS "descuentoMonto"
    `);
  }
}
