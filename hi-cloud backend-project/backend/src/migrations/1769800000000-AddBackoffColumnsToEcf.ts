import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Columnas para el backoff automático de EN_VALIDACION_DGII
 * (consultar-estado-ecf.job.ts): cuándo fue la última consulta, cuántas se
 * han hecho, y si ya pasó el plazo (72h) y quedó para revisión manual.
 *
 * Nombres en camelCase entre comillas — el proyecto no usa NamingStrategy
 * (ver 1761900000000-AddModoEmisionEcf.ts).
 */
export class AddBackoffColumnsToEcf1769800000000 implements MigrationInterface {
  name = 'AddBackoffColumnsToEcf1769800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "ecf"
        ADD COLUMN IF NOT EXISTS "ultimaConsultaAt"     TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "consultasRealizadas"  INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "revisionManual"       BOOLEAN NOT NULL DEFAULT false
    `);
    // Para el filtro "EN_VALIDACION_DGII, no revisionManual, vence la próxima
    // consulta" del cron — evita Seq Scan sobre toda la tabla ecf.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ecf_en_validacion_pendiente"
        ON "ecf" ("estadoDGII", "revisionManual", "ultimaConsultaAt")
        WHERE "estadoDGII" = 'en_validacion_dgii' AND "isActive" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ecf_en_validacion_pendiente"`);
    await queryRunner.query(`
      ALTER TABLE "ecf"
        DROP COLUMN IF EXISTS "ultimaConsultaAt",
        DROP COLUMN IF EXISTS "consultasRealizadas",
        DROP COLUMN IF EXISTS "revisionManual"
    `);
  }
}
