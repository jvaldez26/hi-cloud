import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetencionesToCompras1749993000000 implements MigrationInterface {
  name = 'AddRetencionesToCompras1749993000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE compras
        ADD COLUMN IF NOT EXISTS "retieneItbis"               BOOLEAN       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "porcentajeRetencionItbis"   DECIMAL(5,2)  NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS "montoRetencionItbis"        DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "retieneIsr"                 BOOLEAN       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "porcentajeRetencionIsr"     DECIMAL(5,2)  NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS "montoRetencionIsr"          DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "netoPagar"                  DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
    // Backfill: para compras existentes netoPagar = total
    await queryRunner.query(`UPDATE compras SET "netoPagar" = total WHERE "netoPagar" = 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE compras
        DROP COLUMN IF EXISTS "retieneItbis",
        DROP COLUMN IF EXISTS "porcentajeRetencionItbis",
        DROP COLUMN IF EXISTS "montoRetencionItbis",
        DROP COLUMN IF EXISTS "retieneIsr",
        DROP COLUMN IF EXISTS "porcentajeRetencionIsr",
        DROP COLUMN IF EXISTS "montoRetencionIsr",
        DROP COLUMN IF EXISTS "netoPagar"
    `);
  }
}
