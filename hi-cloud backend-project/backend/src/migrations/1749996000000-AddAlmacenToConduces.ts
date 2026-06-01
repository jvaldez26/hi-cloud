import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlmacenToConduces1749996000000 implements MigrationInterface {
  name = 'AddAlmacenToConduces1749996000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE conduces
        ADD COLUMN IF NOT EXISTS "almacenId" INTEGER NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE conduces DROP COLUMN IF EXISTS "almacenId"`);
  }
}
