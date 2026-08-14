import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el estado "rechazado" a retiros y sus columnas de traza.
 *
 * Diferencia con "anulado":
 *   - anulado:   monto revierte a la caja (solo caja ABIERTA)
 *   - rechazado: supervisor no avala el retiro, pero el dinero NO revierte
 *               (funciona aunque la caja ya esté cerrada; la diferencia queda
 *                documentada en el cuadre del cierre para resolución externa)
 */
export class AddRetiroRechazo1755100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE retiros_caja
        ADD COLUMN IF NOT EXISTS "motivoRechazo"      VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "rechazadoPorId"     INTEGER,
        ADD COLUMN IF NOT EXISTS "rechazadoPorNombre" VARCHAR(150),
        ADD COLUMN IF NOT EXISTS "rechazadoEn"        TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE retiros_caja
        DROP COLUMN IF EXISTS "motivoRechazo",
        DROP COLUMN IF EXISTS "rechazadoPorId",
        DROP COLUMN IF EXISTS "rechazadoPorNombre",
        DROP COLUMN IF EXISTS "rechazadoEn"
    `);
  }
}
