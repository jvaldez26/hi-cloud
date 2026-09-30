import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HiCloud Xlink — identidad pública de la empresa en el directorio.
 *
 * `xlinkId` es el identificador que SÍ se expone a otras empresas (nunca
 * `empresa.id`, que es secuencial y filtrarlo permitiría enumerar/adivinar
 * empresas). UUID generado una sola vez, estable de por vida.
 *
 * `xlinkVisible` default FALSE: publicarse en el directorio es un acto
 * explícito del Admin (ver Fase 2, PATCH /xlink/visibilidad), nunca algo que
 * esta migración decida por la empresa. `xlinkVisibleDesde` queda para
 * mostrar "en el directorio desde" y para la regla de trial (una empresa en
 * prueba no puede activarse).
 */
export class AddXlinkToEmpresa1768400000000 implements MigrationInterface {
  name = 'AddXlinkToEmpresa1768400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "xlinkId" UUID NOT NULL DEFAULT gen_random_uuid()
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "xlinkVisible" BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "xlinkVisibleDesde" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_empresa_xlinkId" ON empresa ("xlinkId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_empresa_xlinkId"`);
    await queryRunner.query(`
      ALTER TABLE empresa
        DROP COLUMN IF EXISTS "xlinkVisibleDesde",
        DROP COLUMN IF EXISTS "xlinkVisible",
        DROP COLUMN IF EXISTS "xlinkId"
    `);
  }
}
