import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NC de Compra — tipo de efecto (2026-09-24):
 *
 * - "tipo" distingue devolución con reversa de inventario / ajuste sin
 *   devolución física / mercancía no recibida — hasta ahora `motivo` era
 *   puramente descriptivo (no cambiaba inventario ni el asiento); `tipo` sí
 *   decide ambos. VARCHAR + CHECK, no un enum de Postgres — mismo criterio
 *   que destinoItbis (AddDestinoItbisComprasGastos) para no arrastrar la
 *   fricción de ALTER TYPE ADD VALUE en la próxima categoría que se agregue.
 * - "ncfProveedor" es el NCF/e-NCF que el PROVEEDOR le puso a SU nota de
 *   crédito (su E34/B04) — HiCloud no emite esto, solo lo registra. Nullable
 *   a nivel de BD (no hay backfill posible para las NC ya existentes); el
 *   DTO lo exige en toda creación nueva.
 * - "compraDetalleId" en el detalle enlaza cada línea de la NC a la línea
 *   de compra_detalles que corrige, para poder validar cantidad devuelta
 *   vs. cantidad recibida (o pendiente) de ESA línea específica, no del
 *   total de la OC.
 */
export class AddTipoNcfNotaCreditoCompra1767400000000 implements MigrationInterface {
  name = 'AddTipoNcfNotaCreditoCompra1767400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE notas_credito_compras
        ADD COLUMN IF NOT EXISTS "tipo" VARCHAR(30) NOT NULL DEFAULT 'devolucion_inventario'
    `);
    await queryRunner.query(`
      ALTER TABLE notas_credito_compras
        ADD CONSTRAINT chk_ncc_tipo
          CHECK ("tipo" IN ('devolucion_inventario','ajuste_sin_devolucion','no_recibida'))
    `);
    await queryRunner.query(`
      ALTER TABLE notas_credito_compras ADD COLUMN IF NOT EXISTS "ncfProveedor" VARCHAR(50)
    `);

    await queryRunner.query(`
      ALTER TABLE nota_credito_compra_detalles ADD COLUMN IF NOT EXISTS "compraDetalleId" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`ALTER TABLE nota_credito_compra_detalles DROP COLUMN IF EXISTS "compraDetalleId"`);

    await queryRunner.query(`ALTER TABLE notas_credito_compras DROP COLUMN IF EXISTS "ncfProveedor"`);
    await queryRunner.query(`ALTER TABLE notas_credito_compras DROP CONSTRAINT IF EXISTS chk_ncc_tipo`);
    await queryRunner.query(`ALTER TABLE notas_credito_compras DROP COLUMN IF EXISTS "tipo"`);
  }
}
