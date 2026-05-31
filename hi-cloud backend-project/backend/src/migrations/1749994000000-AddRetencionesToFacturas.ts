import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetencionesToFacturas1749994000000 implements MigrationInterface {
  name = 'AddRetencionesToFacturas1749994000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "aplicaRetenciones"           BOOLEAN       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "retieneItbis"                BOOLEAN       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "porcentajeRetencionItbis"    DECIMAL(5,2)  NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS "montoRetencionItbis"         DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "retieneIsr"                  BOOLEAN       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "porcentajeRetencionIsr"      DECIMAL(5,2)  NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS "montoRetencionIsr"           DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "netoCobrar"                  DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
    // Backfill: para facturas existentes netoCobrar = total
    await queryRunner.query(`UPDATE facturas SET "netoCobrar" = total WHERE "netoCobrar" = 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "aplicaRetenciones",
        DROP COLUMN IF EXISTS "retieneItbis",
        DROP COLUMN IF EXISTS "porcentajeRetencionItbis",
        DROP COLUMN IF EXISTS "montoRetencionItbis",
        DROP COLUMN IF EXISTS "retieneIsr",
        DROP COLUMN IF EXISTS "porcentajeRetencionIsr",
        DROP COLUMN IF EXISTS "montoRetencionIsr",
        DROP COLUMN IF EXISTS "netoCobrar"
    `);
  }
}
