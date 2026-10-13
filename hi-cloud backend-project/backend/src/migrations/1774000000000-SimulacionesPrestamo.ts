import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 1 — Simulador avanzado. Ver docs/prestamista/etapa-1.md.
 *
 * `resultado` se guarda calculado al crear la simulación (nunca se
 * recalcula al listar) — si el motor cambia después, una simulación vieja
 * sigue mostrando lo que el deudor/prospecto realmente vio, mismo
 * principio que `pr_prestamos.motorConfig` (snapshot, nunca se
 * resincroniza).
 *
 * `pr_solicitudes.simulacionId` es trazabilidad opcional: "convertir en
 * solicitud" la deja escrita, pero una solicitud creada por el camino
 * normal (sin simulación de por medio) la deja NULL.
 */
export class SimulacionesPrestamo1774000000000 implements MigrationInterface {
  name = 'SimulacionesPrestamo1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pr_simulaciones (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "deudorId" INTEGER NULL,
        "nombreProspecto" VARCHAR(200) NULL,
        nombre VARCHAR(200) NOT NULL,
        parametros JSONB NOT NULL,
        resultado JSONB NOT NULL,
        "creadoPor" INTEGER NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_simulaciones_empresa ON pr_simulaciones("empresaId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_simulaciones_deudor ON pr_simulaciones("empresaId", "deudorId")
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_solicitudes ADD COLUMN IF NOT EXISTS "simulacionId" INTEGER NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pr_solicitudes DROP COLUMN IF EXISTS "simulacionId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_simulaciones_deudor`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_simulaciones_empresa`);
    await queryRunner.query(`DROP TABLE IF EXISTS pr_simulaciones`);
  }
}
