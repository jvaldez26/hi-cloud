import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mejoras a la tabla demo_requests:
 * 1. Agregar estado DEMO_REALIZADA al enum (entre DEMO_AGENDADA y CONVERTIDO)
 * 2. Agregar columna `notas` JSONB para historial estructurado de notas
 * 3. Agregar columna `atendidoPor` (userId del super_admin responsable)
 */
export class DemoRequestEnhancements1749100000000 implements MigrationInterface {
  name = 'DemoRequestEnhancements1749100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar 'demo_realizada' al enum existente
    await queryRunner.query(`
      ALTER TYPE "public"."demo_requests_estado_enum"
      ADD VALUE IF NOT EXISTS 'demo_realizada'
    `);

    // 2. Agregar columna notas JSONB (historial estructurado)
    await queryRunner.query(`
      ALTER TABLE demo_requests
      ADD COLUMN IF NOT EXISTS notas JSONB NOT NULL DEFAULT '[]'
    `);

    // 3. Agregar columna atendidoPor
    await queryRunner.query(`
      ALTER TABLE demo_requests
      ADD COLUMN IF NOT EXISTS "atendidoPor" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE demo_requests DROP COLUMN IF EXISTS "atendidoPor"`);
    await queryRunner.query(`ALTER TABLE demo_requests DROP COLUMN IF EXISTS notas`);
    // PostgreSQL no permite eliminar valores de enum — se omite
  }
}
