import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Desglose por método de cobros y anticipos en el cierre de caja.
 *
 * Hasta ahora `cobrosRecibidos` y `totalAnticipos` guardaban el total de TODOS
 * los métodos, y el esperado en efectivo sumaba ese total entero — incluidos
 * cobros por transferencia o cheque, que no están en el cajón. Al separar la
 * parte en efectivo, el cierre queda además auditable: se ve de dónde sale cada
 * número en vez de tener que recalcularlo.
 *
 * Solo AÑADE columnas con default 0. No toca ni recalcula ningún cierre
 * existente: los históricos conservan exactamente los valores que tienen hoy.
 * Las columnas nuevas quedan en 0 para los cierres pasados, que es lo correcto
 * — nunca se midió ese desglose y rellenarlo sería inventar datos.
 */
export class AddDesgloseEfectivoCierresCaja1760700000000 implements MigrationInterface {
  name = 'AddDesgloseEfectivoCierresCaja1760700000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "cobrosEfectivo"    DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cobrosOtrosMedios" DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "anticiposEfectivo" DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "anticiposOtrosMedios" DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "cobrosEfectivo",
        DROP COLUMN IF EXISTS "cobrosOtrosMedios",
        DROP COLUMN IF EXISTS "anticiposEfectivo",
        DROP COLUMN IF EXISTS "anticiposOtrosMedios"
    `);
  }
}
