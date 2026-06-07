import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas nomina_prestamos y nomina_anticipos.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS y DO/EXCEPTION para enums.
 */
export class CreateNominaPrestamosAnticipos1749999100000 implements MigrationInterface {
  name = 'CreateNominaPrestamosAnticipos1749999100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum: estado de préstamo ────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "nomina_prestamos_estado_enum"
          AS ENUM('activo', 'saldado', 'anulado');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── Enum: estado de anticipo ────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "nomina_anticipos_estado_enum"
          AS ENUM('pendiente', 'descontado', 'anulado');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── Tabla nomina_prestamos ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nomina_prestamos" (
        "id"              SERIAL  PRIMARY KEY,
        "isActive"        BOOLEAN NOT NULL DEFAULT true,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"       INTEGER,
        "empleadoId"      INTEGER NOT NULL,
        "monto"           NUMERIC(12,2) NOT NULL,
        "cuotas"          INTEGER NOT NULL,
        "cuotasPagadas"   INTEGER NOT NULL DEFAULT 0,
        "montoMensual"    NUMERIC(10,2) NOT NULL,
        "saldoPendiente"  NUMERIC(12,2) NOT NULL,
        "fechaDesembolso" DATE NOT NULL,
        "descripcion"     VARCHAR(300),
        "estado"          "nomina_prestamos_estado_enum" NOT NULL DEFAULT 'activo'
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_nomina_prestamos_empresa_empleado_estado"
        ON "nomina_prestamos" ("empresaId", "empleadoId", "estado")
    `);

    // ── Tabla nomina_anticipos ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nomina_anticipos" (
        "id"               SERIAL  PRIMARY KEY,
        "isActive"         BOOLEAN NOT NULL DEFAULT true,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"        INTEGER,
        "empleadoId"       INTEGER NOT NULL,
        "monto"            NUMERIC(12,2) NOT NULL,
        "periodoDescontar" VARCHAR(7) NOT NULL,
        "descripcion"      VARCHAR(300),
        "estado"           "nomina_anticipos_estado_enum" NOT NULL DEFAULT 'pendiente'
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_nomina_anticipos_empresa_empleado_estado"
        ON "nomina_anticipos" ("empresaId", "empleadoId", "estado")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "nomina_anticipos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nomina_prestamos"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "nomina_anticipos_estado_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "nomina_prestamos_estado_enum"`);
  }
}
