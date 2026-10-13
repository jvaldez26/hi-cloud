import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prestamista Etapa 2 (resto) — ver docs/prestamista/etapa-2-resto.md.
 *
 * - pr_pagos: anulación con reversa (§1) — un pago anulado nunca se borra,
 *   queda marcado con quién/cuándo/por qué.
 * - pr_garantes: ciclo de vida (§2) — activo/liberado, nunca automático.
 * - pr_garantias: columnas de rastro para liberar/ejecutar (§3) — el estado
 *   ('activa'/'liberada'/'ejecutada') ya existía como columna libre.
 */
export class PrestamistaAnulacionGarantiasGarantes1775000000000 implements MigrationInterface {
  name = 'PrestamistaAnulacionGarantiasGarantes1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_pagos
        ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'activo',
        ADD COLUMN IF NOT EXISTS "anuladoPor" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "anuladoPorNombre" VARCHAR(200) NULL,
        ADD COLUMN IF NOT EXISTS "anuladoEn" TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "motivoAnulacion" TEXT NULL
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_garantes
        ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'activo',
        ADD COLUMN IF NOT EXISTS "liberadoPor" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "liberadoPorNombre" VARCHAR(200) NULL,
        ADD COLUMN IF NOT EXISTS "liberadoEn" TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "motivoLiberacion" TEXT NULL
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_garantias
        ADD COLUMN IF NOT EXISTS "fechaEjecucion" TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "motivoCambioEstado" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "cambiadoPor" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "cambiadoPorNombre" VARCHAR(200) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pr_garantias
        DROP COLUMN IF EXISTS "cambiadoPorNombre",
        DROP COLUMN IF EXISTS "cambiadoPor",
        DROP COLUMN IF EXISTS "motivoCambioEstado",
        DROP COLUMN IF EXISTS "fechaEjecucion"
    `);
    await queryRunner.query(`
      ALTER TABLE pr_garantes
        DROP COLUMN IF EXISTS "motivoLiberacion",
        DROP COLUMN IF EXISTS "liberadoEn",
        DROP COLUMN IF EXISTS "liberadoPorNombre",
        DROP COLUMN IF EXISTS "liberadoPor",
        DROP COLUMN IF EXISTS estado
    `);
    await queryRunner.query(`
      ALTER TABLE pr_pagos
        DROP COLUMN IF EXISTS "motivoAnulacion",
        DROP COLUMN IF EXISTS "anuladoEn",
        DROP COLUMN IF EXISTS "anuladoPorNombre",
        DROP COLUMN IF EXISTS "anuladoPor",
        DROP COLUMN IF EXISTS estado
    `);
  }
}
