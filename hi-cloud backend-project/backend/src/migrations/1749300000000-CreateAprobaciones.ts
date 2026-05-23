import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `aprobaciones` con sus tipos enum y sus índices.
 * Idempotente: usa IF NOT EXISTS y DO/EXCEPTION para los tipos enum.
 *
 * La tabla soporta el flujo de aprobación multi-tenant para
 * cotizaciones, compras, gastos, pre-facturas y notas de débito.
 */
export class CreateAprobaciones1749300000000 implements MigrationInterface {
  name = 'CreateAprobaciones1749300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tipos enum (idempotentes — ignoran "duplicate_object")
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "aprobaciones_tipo_enum" AS ENUM(
          'cotizacion',
          'pre_factura',
          'compra',
          'gasto',
          'nota_debito',
          'otro'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "aprobaciones_estado_enum" AS ENUM(
          'pendiente',
          'aprobado',
          'rechazado'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Tabla principal (idempotente)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "aprobaciones" (
        "id"                   SERIAL                        NOT NULL,
        "isActive"             boolean                       NOT NULL DEFAULT true,
        "createdAt"            TIMESTAMP                     NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMP                     NOT NULL DEFAULT now(),
        "empresaId"            integer,
        "tipo"                 "aprobaciones_tipo_enum"      NOT NULL,
        "entidadId"            integer                       NOT NULL,
        "entidadRef"           character varying(50),
        "monto"                numeric(14,2),
        "estado"               "aprobaciones_estado_enum"    NOT NULL DEFAULT 'pendiente',
        "solicitadoPorId"      integer                       NOT NULL,
        "nombreSolicitante"    character varying(150),
        "aprobadoPorId"        integer,
        "nombreAprobador"      character varying(150),
        "comentarioSolicitud"  text,
        "comentarioResolucion" text,
        "fechaResolucion"      TIMESTAMP,
        CONSTRAINT "PK_aprobaciones_id" PRIMARY KEY ("id")
      )
    `);

    // Índices (idempotentes)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_aprobaciones_empresaId"
        ON "aprobaciones" ("empresaId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_aprobaciones_empresaId_estado"
        ON "aprobaciones" ("empresaId", "estado")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_aprobaciones_empresaId_solicitadoPorId"
        ON "aprobaciones" ("empresaId", "solicitadoPorId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aprobaciones_empresaId_solicitadoPorId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aprobaciones_empresaId_estado"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aprobaciones_empresaId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aprobaciones"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "aprobaciones_estado_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "aprobaciones_tipo_enum"`);
  }
}
