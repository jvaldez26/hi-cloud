import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Amplía a 4 decimales las columnas donde se guarda un descuento en BASE
 * IMPONIBLE, porque ese valor es el resultado de una división:
 *
 *   descuento tecleado (pesos finales c/ITBIS) ÷ 1.18 = descuento en base
 *   10 / 1.18 = 8.4746
 *
 * Con 2 decimales se guardaba 8.47 y al reconstruir el importe para el recibo
 * daba 8.47 × 1.18 = 9.99 en vez de los 10.00 pactados — la impresión original
 * y la reimpresión volvían a divergir, y el contrato de línea
 * (precioOriginal − descuentoMonto = precioUnitario) perdía precisión.
 *
 * NO se toca facturas."descuentoGeneralFinal": ahí vive el importe PACTADO en
 * pesos finales (dinero que se entrega en mano), que por naturaleza tiene 2
 * decimales y no sale de ninguna división.
 *
 * Volumen al momento de escribirla: factura_detalles 29.029 filas (48 con
 * descuento), facturas 9.354. El cambio de escala en numeric reescribe la
 * tabla, así que se acota con lock_timeout para no colgar el POS: si la tabla
 * está ocupada, la migración falla rápido y se reintenta en el próximo deploy
 * en vez de bloquear las ventas.
 */
export class AmpliarPrecisionDescuentos1754990000000 implements MigrationInterface {
  name = 'AmpliarPrecisionDescuentos1754990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE factura_detalles
        ALTER COLUMN "descuentoMonto" TYPE NUMERIC(12, 4)
    `);
    await queryRunner.query(`
      ALTER TABLE facturas
        ALTER COLUMN "descuentoGeneralValor" TYPE NUMERIC(12, 4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    // Redondea los valores existentes: bajar la escala trunca de todos modos,
    // hacerlo explícito deja claro que la vuelta atrás PIERDE precisión y que
    // los recibos de esas facturas volverán a mostrar 9.99 en vez de 10.00.
    await queryRunner.query(`
      UPDATE factura_detalles
         SET "descuentoMonto" = ROUND("descuentoMonto", 2)
       WHERE "descuentoMonto" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE factura_detalles
        ALTER COLUMN "descuentoMonto" TYPE NUMERIC(12, 2)
    `);
    await queryRunner.query(`
      UPDATE facturas
         SET "descuentoGeneralValor" = ROUND("descuentoGeneralValor", 2)
       WHERE "descuentoGeneralValor" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE facturas
        ALTER COLUMN "descuentoGeneralValor" TYPE NUMERIC(12, 2)
    `);
  }
}
