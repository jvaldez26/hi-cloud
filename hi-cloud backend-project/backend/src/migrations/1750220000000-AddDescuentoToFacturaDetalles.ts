import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescuentoToFacturaDetalles1750220000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "factura_detalles"
        ADD COLUMN IF NOT EXISTS "descuentoPct"   NUMERIC(5,2)   NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "precioOriginal" NUMERIC(12,2)  NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "factura_detalles"
        DROP COLUMN IF EXISTS "descuentoPct",
        DROP COLUMN IF EXISTS "precioOriginal"
    `);
  }
}
