import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSucursalIdToCotizaciones1749999000000 implements MigrationInterface {
  name = 'AddSucursalIdToCotizaciones1749999000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cotizaciones
        ADD COLUMN IF NOT EXISTS "sucursalId" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cotizaciones DROP COLUMN IF EXISTS "sucursalId"`);
  }
}
