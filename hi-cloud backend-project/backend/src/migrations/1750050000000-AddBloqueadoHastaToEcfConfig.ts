import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBloqueadoHastaToEcfConfig1750050000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE empresa_ecf_config
        ADD COLUMN IF NOT EXISTS "bloqueadoHasta" TIMESTAMP NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE empresa_ecf_config
        DROP COLUMN IF EXISTS "bloqueadoHasta"
    `);
  }
}
