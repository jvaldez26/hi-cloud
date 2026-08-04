import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordatorioGracia1753000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE suscripciones
      ADD COLUMN IF NOT EXISTS "recordatorio1dGraciaEnviado" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE suscripciones
      DROP COLUMN IF EXISTS "recordatorio1dGraciaEnviado"
    `);
  }
}
