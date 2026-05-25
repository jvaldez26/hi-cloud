import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega campos de firma digital (fase 1 — básica) a contratos_laborales:
 *   - estadoFirma  VARCHAR(30) DEFAULT 'pendiente_firma' NOT NULL
 *   - firmadoEn    TIMESTAMP   NULL
 *
 * Idempotente: usa ADD COLUMN IF NOT EXISTS.
 */
export class ContratoFirmaDigital1749400000000 implements MigrationInterface {
  name = 'ContratoFirmaDigital1749400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contratos_laborales
        ADD COLUMN IF NOT EXISTS "estadoFirma" VARCHAR(30) NOT NULL DEFAULT 'pendiente_firma',
        ADD COLUMN IF NOT EXISTS "firmadoEn"   TIMESTAMP  NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contratos_laborales
        DROP COLUMN IF EXISTS "estadoFirma",
        DROP COLUMN IF EXISTS "firmadoEn"
    `);
  }
}
