import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tickets de soporte (usuario autenticado → Super Admin) — ver soporte.module.ts.
 * No confundir con `contacto-soporte` (formulario público sin login, en
 * auth.controller.ts) ni con los "Mensajes a clientes" del Super Admin
 * (mensajes.entity — dirección contraria: Super Admin → clientes).
 *
 * Idempotente: DO/EXCEPTION para los tipos enum, IF NOT EXISTS para tabla e
 * índices — mismo patrón que CreateAprobaciones.
 */
export class CreateSoporteTickets1768000000000 implements MigrationInterface {
  name = 'CreateSoporteTickets1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "soporte_tickets_asunto_enum" AS ENUM(
          'error_tecnico',
          'duda_uso',
          'solicitud_funcion',
          'facturacion',
          'certificacion_dgii',
          'otro'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "soporte_tickets_estado_enum" AS ENUM(
          'abierto',
          'en_proceso',
          'resuelto',
          'cerrado'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "soporte_tickets_prioridad_enum" AS ENUM(
          'baja',
          'media',
          'alta'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "soporte_tickets" (
        "id"                  SERIAL                            NOT NULL,
        "isActive"            boolean                           NOT NULL DEFAULT true,
        "createdAt"           TIMESTAMP                         NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMP                         NOT NULL DEFAULT now(),
        "empresaId"           integer,
        "usuarioId"           integer                           NOT NULL,
        "asunto"              "soporte_tickets_asunto_enum"     NOT NULL,
        "mensaje"             text                              NOT NULL,
        "estado"              "soporte_tickets_estado_enum"     NOT NULL DEFAULT 'abierto',
        "prioridad"           "soporte_tickets_prioridad_enum",
        "contextoAutomatico"  jsonb                             NOT NULL,
        "respuestaAdmin"      text,
        "respondidoPor"       integer,
        "respondidoEn"        TIMESTAMPTZ,
        CONSTRAINT "PK_soporte_tickets_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soporte_tickets_empresaId"
        ON "soporte_tickets" ("empresaId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soporte_tickets_usuarioId"
        ON "soporte_tickets" ("usuarioId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soporte_tickets_estado"
        ON "soporte_tickets" ("estado")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_soporte_tickets_estado"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_soporte_tickets_usuarioId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_soporte_tickets_empresaId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "soporte_tickets"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "soporte_tickets_prioridad_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "soporte_tickets_estado_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "soporte_tickets_asunto_enum"`);
  }
}
