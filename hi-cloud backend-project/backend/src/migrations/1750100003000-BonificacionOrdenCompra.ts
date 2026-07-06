import { MigrationInterface, QueryRunner } from 'typeorm';

export class BonificacionOrdenCompra1750100003000 implements MigrationInterface {
  name = 'BonificacionOrdenCompra1750100003000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE compra_detalles
        ADD COLUMN IF NOT EXISTS "cantidadBonificada" DECIMAL(12,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cantidadTotal"      DECIMAL(12,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "costoUnitarioReal"  DECIMAL(12,4)
    `);
    // Backfill: filas existentes no tienen bonificación — total = facturada
    await qr.query(`
      UPDATE compra_detalles
         SET "cantidadTotal"     = cantidad,
             "costoUnitarioReal" = CASE WHEN cantidad > 0 THEN ROUND(subtotal / cantidad, 4) ELSE NULL END
       WHERE "cantidadTotal" = 0
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE compra_detalles DROP COLUMN IF EXISTS "cantidadBonificada"`);
    await qr.query(`ALTER TABLE compra_detalles DROP COLUMN IF EXISTS "cantidadTotal"`);
    await qr.query(`ALTER TABLE compra_detalles DROP COLUMN IF EXISTS "costoUnitarioReal"`);
  }
}
