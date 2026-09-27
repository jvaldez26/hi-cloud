import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescuentoGeneralToCompras1767800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "compras"
        ADD COLUMN IF NOT EXISTS "descuentoGeneralTipo"  VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "descuentoGeneralValor" NUMERIC(12,4),
        ADD COLUMN IF NOT EXISTS "descuentoGeneralMonto" NUMERIC(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "compras"
        DROP COLUMN IF EXISTS "descuentoGeneralTipo",
        DROP COLUMN IF EXISTS "descuentoGeneralValor",
        DROP COLUMN IF EXISTS "descuentoGeneralMonto"
    `);
  }
}
