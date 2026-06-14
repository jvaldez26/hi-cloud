import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComprasExtendidos1750060000000 implements MigrationInterface {
  name = 'AddComprasExtendidos1750060000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE compras
        ADD COLUMN IF NOT EXISTS "tipoPago"                VARCHAR(20)       DEFAULT 'contado',
        ADD COLUMN IF NOT EXISTS "diasCredito"             INTEGER           DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "fechaVencimiento"        DATE,
        ADD COLUMN IF NOT EXISTS moneda                    VARCHAR(3)        DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio"              DECIMAL(10,4)     DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "retieneItbis"            BOOLEAN           DEFAULT false,
        ADD COLUMN IF NOT EXISTS "porcentajeRetencionItbis" DECIMAL(5,2)     DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "montoRetencionItbis"     DECIMAL(12,2)     DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "retieneIsr"              BOOLEAN           DEFAULT false,
        ADD COLUMN IF NOT EXISTS "porcentajeRetencionIsr"  DECIMAL(5,2)      DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "montoRetencionIsr"       DECIMAL(12,2)     DEFAULT 0
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE compras
        DROP COLUMN IF EXISTS "tipoPago",
        DROP COLUMN IF EXISTS "diasCredito",
        DROP COLUMN IF EXISTS "fechaVencimiento",
        DROP COLUMN IF EXISTS moneda,
        DROP COLUMN IF EXISTS "tipoCambio",
        DROP COLUMN IF EXISTS "retieneItbis",
        DROP COLUMN IF EXISTS "porcentajeRetencionItbis",
        DROP COLUMN IF EXISTS "montoRetencionItbis",
        DROP COLUMN IF EXISTS "retieneIsr",
        DROP COLUMN IF EXISTS "porcentajeRetencionIsr",
        DROP COLUMN IF EXISTS "montoRetencionIsr"
    `);
  }
}
