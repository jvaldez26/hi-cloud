import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Costo manual de producto — para productos que entraron al catálogo sin
 * pasar por una Compra (importación masiva, alta manual en POS), con
 * costoPromedio en 0 y por lo tanto sin línea de costo de venta en el
 * asiento de cada factura. Mismo patrón que retiros_caja (motivoRechazo/
 * rechazadoPorId/rechazadoPorNombre/rechazadoEn, migración
 * 1755100000000-AddRetiroRechazo) — columnas denormalizadas sobre la fila,
 * no una tabla de historial aparte: es una acción de baja frecuencia
 * (bootstrap de un valor de partida, no un evento recurrente), y el
 * AuditInterceptor global ya audita cada PATCH a /productos/* en nivel
 * IMPORTANTE.
 *
 * "costoManualAnterior" guarda el costoPromedio justo antes del ajuste —
 * sin esto, una vez AVCO recalcula tras la primera compra real, no
 * quedaría ningún rastro de qué valor había puesto el usuario a mano.
 */
export class AddCostoManualProducto1764000000000 implements MigrationInterface {
  name = 'AddCostoManualProducto1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS "costoManualMotivo"     TEXT,
        ADD COLUMN IF NOT EXISTS "costoManualPorId"       INTEGER,
        ADD COLUMN IF NOT EXISTS "costoManualPorNombre"   VARCHAR(200),
        ADD COLUMN IF NOT EXISTS "costoManualEn"          TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "costoManualAnterior"    DECIMAL(14,4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE productos
        DROP COLUMN IF EXISTS "costoManualMotivo",
        DROP COLUMN IF EXISTS "costoManualPorId",
        DROP COLUMN IF EXISTS "costoManualPorNombre",
        DROP COLUMN IF EXISTS "costoManualEn",
        DROP COLUMN IF EXISTS "costoManualAnterior"
    `);
  }
}
