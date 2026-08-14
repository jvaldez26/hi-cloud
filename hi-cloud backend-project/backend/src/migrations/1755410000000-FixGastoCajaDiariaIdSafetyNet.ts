import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Safety-net para cajaDiariaId en gastos.
 *
 * La migración original 1755200000000-AddGastoCajaDiariaId pudo haber
 * fallado en producción por lock_timeout. Al usar ADD COLUMN IF NOT EXISTS
 * esta migración es idempotente: si la columna ya existe, no hace nada.
 *
 * Al correr en nueva timestamp garantiza que TypeORM la ejecute aunque
 * 1755200000000 ya esté en typeorm_migrations con estado fallido/parcial.
 */
export class FixGastoCajaDiariaIdSafetyNet1755410000000 implements MigrationInterface {
  name = 'FixGastoCajaDiariaIdSafetyNet1755410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotente — si la columna ya existe, ADD COLUMN IF NOT EXISTS no hace nada.
    await queryRunner.query(`
      ALTER TABLE gastos
        ADD COLUMN IF NOT EXISTS "cajaDiariaId" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE gastos
        DROP COLUMN IF EXISTS "cajaDiariaId"
    `);
  }
}
