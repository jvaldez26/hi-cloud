import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas del módulo Vacaciones y Ausencias si no existen.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS y DO/EXCEPTION para enums.
 *
 * Si las tablas ya existen (p.ej. fueron creadas con synchronize:true)
 * esta migración no hace ningún cambio destructivo.
 */
export class CreateVacacionesTables1749500000000 implements MigrationInterface {
  name = 'CreateVacacionesTables1749500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum: estado de solicitud ───────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "solicitudes_vacacion_estado_enum"
          AS ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── Enum: tipo de ausencia ──────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "ausencias_tipo_enum"
          AS ENUM(
            'enfermedad', 'personal', 'tardia', 'sin_aviso',
            'maternidad', 'paternidad', 'luto', 'licencia_especial'
          );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── Tabla solicitudes_vacacion ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "solicitudes_vacacion" (
        "id"                    SERIAL  PRIMARY KEY,
        "isActive"              BOOLEAN NOT NULL DEFAULT true,
        "createdAt"             TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"             INT     NULL,
        "empleadoId"            INT     NOT NULL,
        "fechaInicio"           DATE    NOT NULL,
        "fechaFin"              DATE    NOT NULL,
        "diasSolicitados"       INT     NOT NULL,
        "estado"                "solicitudes_vacacion_estado_enum" NOT NULL DEFAULT 'pendiente',
        "motivo"                TEXT    NULL,
        "observacionAprobador"  TEXT    NULL,
        "aprobadorId"           INT     NULL,
        "fechaRespuesta"        TIMESTAMP NULL,
        "anio"                  INT     NOT NULL DEFAULT EXTRACT(YEAR FROM now())
      )
    `);

    // ── Tabla ausencias ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ausencias" (
        "id"             SERIAL   PRIMARY KEY,
        "isActive"       BOOLEAN  NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"      INT      NULL,
        "empleadoId"     INT      NOT NULL,
        "fecha"          DATE     NOT NULL,
        "tipo"           "ausencias_tipo_enum" NOT NULL,
        "justificada"    BOOLEAN  NOT NULL DEFAULT false,
        "descripcion"    TEXT     NULL,
        "dias"           DECIMAL(4,2) NOT NULL DEFAULT 1,
        "registradoPor"  INT      NULL
      )
    `);

    // ── Índices ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_solicitudes_vac_empresa"
        ON "solicitudes_vacacion" ("empresaId", "isActive")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ausencias_empresa_fecha"
        ON "ausencias" ("empresaId", "fecha")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ausencias"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "solicitudes_vacacion"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ausencias_tipo_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "solicitudes_vacacion_estado_enum"`);
  }
}
