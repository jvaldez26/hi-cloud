import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVentasCreditoCaja1752700000000 implements MigrationInterface {
  name = 'AddVentasCreditoCaja1752700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_caja
      ADD COLUMN IF NOT EXISTS "ventasCredito" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cierres_caja DROP COLUMN IF EXISTS "ventasCredito"`);
  }
}
