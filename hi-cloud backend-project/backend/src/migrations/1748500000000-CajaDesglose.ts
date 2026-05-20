import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega columnas de desglose de billetes y pago al cierre de caja.
 * El POS enviaba estos datos pero el backend los descartaba.
 */
export class CajaDesglose1748500000000 implements MigrationInterface {
  name = 'CajaDesglose1748500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "desgloseBilletes" JSONB,
        ADD COLUMN IF NOT EXISTS "desglosePago"     JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "desgloseBilletes",
        DROP COLUMN IF EXISTS "desglosePago"
    `);
  }
}
