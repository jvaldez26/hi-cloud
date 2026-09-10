import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Descuento POR LÍNEA en Órdenes de Compra — antes no existía, y las OC no
 * cuadraban contra la factura del proveedor cuando esta traía descuento.
 *
 * Mismo naming y escala que factura_detalles.descuentoPct/descuentoMonto
 * (ver 1750230000000 y 1754990000000): descuentoMonto en NUMERIC(12,4) porque
 * puede salir de dividir un porcentaje capturado (precio×cantidad×pct/100);
 * descuentoPct en NUMERIC(5,2) — es solo ayuda de captura, nunca se usa para
 * calcular, así que no necesita más precisión. A diferencia de facturas,
 * aquí NO se convierte desde pesos finales (c/ITBIS): en compras el
 * descuento se teclea/persiste en BASE, tal como ya lo documenta el DTO.
 *
 * compras.descuentoTotal es la suma de línea, denormalizada igual que
 * subtotal/itbis/total ya lo están — para el pie de la orden sin tener que
 * agregar compra_detalles en cada lectura.
 *
 * DEFAULT 0 en las tres: las OC existentes quedan con descuento cero y sus
 * totales no cambian (subtotal ya era exactamente precio×cantidad, que es
 * la base gravable cuando el descuento es cero).
 */
export class AddDescuentoToCompraDetalles1762700000000 implements MigrationInterface {
  name = 'AddDescuentoToCompraDetalles1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "compra_detalles"
        ADD COLUMN IF NOT EXISTS "descuentoPct"   NUMERIC(5,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "descuentoMonto" NUMERIC(12,4) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "compras"
        ADD COLUMN IF NOT EXISTS "descuentoTotal" NUMERIC(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "compras"
        DROP COLUMN IF EXISTS "descuentoTotal"
    `);
    await queryRunner.query(`
      ALTER TABLE "compra_detalles"
        DROP COLUMN IF EXISTS "descuentoPct",
        DROP COLUMN IF EXISTS "descuentoMonto"
    `);
  }
}
