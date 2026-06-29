import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPermiteDecimalesUom1750040100000 implements MigrationInterface {
  name = 'AddPermiteDecimalesUom1750040100000';

  async up(qr: QueryRunner): Promise<void> {
    // ── A2: agregar permiteDecimales a unidades_medida ──────────────────────
    await qr.query(`
      ALTER TABLE unidades_medida
        ADD COLUMN IF NOT EXISTS "permiteDecimales" BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Marcar las unidades continuas (peso, volumen, longitud, área) como fraccionables.
    // Aplica a todas las empresas que ya ejecutaron /uom/inicializar.
    await qr.query(`
      UPDATE unidades_medida
        SET "permiteDecimales" = TRUE
        WHERE tipo IN ('peso', 'volumen', 'longitud', 'area')
          AND "isActive" = TRUE
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE unidades_medida DROP COLUMN IF EXISTS "permiteDecimales"
    `);
  }
}
