import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Campos para la verificacion REAL de un backup: restaurarlo en una base
 * temporal y cuadrar los conteos.
 *
 * Se guardan los conteos del dump Y los de produccion en ese mismo momento.
 * Los dos, a proposito: entre que se toma el dump y que se verifica pasan
 * minutos y produccion sigue facturando, asi que una diferencia pequeña es
 * normal y esperable. Con un solo numero habria que adivinar si la diferencia
 * es deriva o corrupcion.
 *
 * Solo AÑADE columnas. No recalcula ni modifica nada existente.
 */
export class AddVerificacionRestauracionBackups1760900001000 implements MigrationInterface {
  name = 'AddVerificacionRestauracionBackups1760900001000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE backup_registros
        ADD COLUMN IF NOT EXISTS "restauracionProbadaEn" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "filasVerificadas"      JSONB NULL,
        ADD COLUMN IF NOT EXISTS "verificacionMensaje"   TEXT NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE backup_registros
        DROP COLUMN IF EXISTS "restauracionProbadaEn",
        DROP COLUMN IF EXISTS "filasVerificadas",
        DROP COLUMN IF EXISTS "verificacionMensaje"
    `);
  }
}
