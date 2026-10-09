import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motor financiero v2 (Etapa 2, Fase 2A/2B) — ver
 * docs/prestamista/motor-financiero.md y prestamista/motor/*.
 *
 * Todas las columnas nuevas son nullable o tienen default que preserva el
 * comportamiento 'v1' (motorVersion='v1', esPeriodoGracia=false,
 * cargosPagados=0) — ningún préstamo existente cambia de comportamiento.
 */
export class MotorV2Prestamista1772000000000 implements MigrationInterface {
  name = 'MotorV2Prestamista1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE pr_productos_prestamo
        ADD COLUMN IF NOT EXISTS "motorConfig" JSONB DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE pr_prestamos
        ADD COLUMN IF NOT EXISTS "motorVersion" VARCHAR(2) NOT NULL DEFAULT 'v1',
        ADD COLUMN IF NOT EXISTS "motorConfig" JSONB DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE pr_cuotas
        ADD COLUMN IF NOT EXISTS cargos JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "cargosPagados" DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "esPeriodoGracia" BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pr_feriados (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        anio INTEGER NOT NULL,
        fecha DATE NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        confirmado BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pr_feriados_empresa_anio_fecha"
        ON pr_feriados ("empresaId", anio, fecha)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pr_feriados_empresa_anio_fecha"`);
    await queryRunner.query(`DROP TABLE IF EXISTS pr_feriados`);
    await queryRunner.query(`
      ALTER TABLE pr_cuotas
        DROP COLUMN IF EXISTS cargos,
        DROP COLUMN IF EXISTS "cargosPagados",
        DROP COLUMN IF EXISTS "esPeriodoGracia"
    `);
    await queryRunner.query(`
      ALTER TABLE pr_prestamos
        DROP COLUMN IF EXISTS "motorVersion",
        DROP COLUMN IF EXISTS "motorConfig"
    `);
    await queryRunner.query(`
      ALTER TABLE pr_productos_prestamo
        DROP COLUMN IF EXISTS "motorConfig"
    `);
  }
}
