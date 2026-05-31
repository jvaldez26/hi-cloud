import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEstadoAprobacionToEmpresa1749995000000 implements MigrationInterface {
  name = 'AddEstadoAprobacionToEmpresa1749995000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "estadoAprobacion" VARCHAR(20) NOT NULL DEFAULT 'aprobada',
        ADD COLUMN IF NOT EXISTS "motivoRechazo"    TEXT,
        ADD COLUMN IF NOT EXISTS "aprobadoPor"      INTEGER,
        ADD COLUMN IF NOT EXISTS "fechaAprobacion"  TIMESTAMPTZ
    `);
    // Empresas existentes ya están aprobadas — el DEFAULT 'aprobada' lo cubre
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE empresa
        DROP COLUMN IF EXISTS "estadoAprobacion",
        DROP COLUMN IF EXISTS "motivoRechazo",
        DROP COLUMN IF EXISTS "aprobadoPor",
        DROP COLUMN IF EXISTS "fechaAprobacion"
    `);
  }
}
