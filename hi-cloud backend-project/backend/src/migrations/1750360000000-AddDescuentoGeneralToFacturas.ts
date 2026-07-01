import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade soporte de descuento general (a nivel de cabecera) en facturas.
 *
 * descuentoGeneralTipo: 'monto' (RD$ fijo) | 'porcentaje' (% sobre subtotal)
 * descuentoGeneralValor: el valor del descuento (importe o porcentaje)
 *
 * Los descuentos por línea ya existían desde las migraciones 1750220000000
 * y 1750230000000 (descuentoPct + descuentoMonto en factura_detalles).
 */
export class AddDescuentoGeneralToFacturas1750360000000 implements MigrationInterface {
  name = 'AddDescuentoGeneralToFacturas1750360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "descuentoGeneralTipo"  VARCHAR(10)     DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "descuentoGeneralValor" NUMERIC(12, 2)  DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "descuentoGeneralTipo",
        DROP COLUMN IF EXISTS "descuentoGeneralValor"
    `);
  }
}
