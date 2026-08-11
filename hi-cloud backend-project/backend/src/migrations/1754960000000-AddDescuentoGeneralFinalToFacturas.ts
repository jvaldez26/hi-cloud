import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade el importe FINAL (c/ITBIS) del descuento general.
 *
 * `descuentoGeneralValor` guarda el descuento en BASE imponible, que es lo que
 * el backend necesita para recalcular el ITBIS. Pero el cajero lo pacta de viva
 * voz en pesos finales ("te doy 10 pesos") y ese es el número que el cliente
 * espera ver en el recibo. Derivarlo desde la base se desvía hasta 1 centavo por
 * doble redondeo y haría divergir la impresión original de la reimpresión, así
 * que se persiste tal como se tecleó.
 *
 * Invariante del recibo: total + descuentoGeneralFinal = suma de las líneas
 * mostradas c/ITBIS.
 */
export class AddDescuentoGeneralFinalToFacturas1754960000000 implements MigrationInterface {
  name = 'AddDescuentoGeneralFinalToFacturas1754960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "descuentoGeneralFinal" NUMERIC(12, 2) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "descuentoGeneralFinal"
    `);
  }
}
