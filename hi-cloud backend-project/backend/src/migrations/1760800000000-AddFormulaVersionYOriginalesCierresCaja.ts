import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trazabilidad del cierre de caja: con qué fórmula se calculó y qué había antes
 * de un recierre.
 *
 * Contexto: la fórmula del efectivo esperado cambió (ahora solo suma lo que está
 * físicamente en el cajón). Los cierres anteriores NO se recalculan, así que
 * conviven números de dos fórmulas distintas en la misma tabla. Sin marcarlo,
 * habría que adivinar por la fecha si dos cierres son comparables.
 *
 * Y reabrir un cierre (anularCierre) ponía saldoCierre, saldoFisico y diferencia
 * a 0: los números con los que se cuadró dinero real desaparecían sin rastro.
 * Ahora se conservan.
 *
 * Solo AÑADE columnas. No recalcula ni modifica ningún cierre existente:
 *   - formulaVersion = 1 para todo lo ya cerrado (default), que es exacto:
 *     esos números salieron de la fórmula vieja.
 *   - Los campos *Original quedan NULL, que significa "nunca se recerró".
 */
export class AddFormulaVersionYOriginalesCierresCaja1760800000000 implements MigrationInterface {
  name = 'AddFormulaVersionYOriginalesCierresCaja1760800000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "formulaVersion"         INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "esperadoOriginal"       DECIMAL(12,2) NULL,
        ADD COLUMN IF NOT EXISTS "contadoOriginal"        DECIMAL(12,2) NULL,
        ADD COLUMN IF NOT EXISTS "diferenciaOriginal"     DECIMAL(12,2) NULL,
        ADD COLUMN IF NOT EXISTS "formulaVersionOriginal" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "reabiertoPorUsuarioId"  INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "reabiertoPorNombre"     VARCHAR(120) NULL,
        ADD COLUMN IF NOT EXISTS "reabiertoEn"            TIMESTAMPTZ NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "formulaVersion",
        DROP COLUMN IF EXISTS "esperadoOriginal",
        DROP COLUMN IF EXISTS "contadoOriginal",
        DROP COLUMN IF EXISTS "diferenciaOriginal",
        DROP COLUMN IF EXISTS "formulaVersionOriginal",
        DROP COLUMN IF EXISTS "reabiertoPorUsuarioId",
        DROP COLUMN IF EXISTS "reabiertoPorNombre",
        DROP COLUMN IF EXISTS "reabiertoEn"
    `);
  }
}
