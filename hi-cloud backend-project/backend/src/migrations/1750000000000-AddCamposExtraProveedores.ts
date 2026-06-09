import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCamposExtraProveedores1750000000000 implements MigrationInterface {
  name = 'AddCamposExtraProveedores1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE proveedores
        ADD COLUMN IF NOT EXISTS categoria       VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "diasPago"      INTEGER,
        ADD COLUMN IF NOT EXISTS banco           VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "cuentaBancaria" VARCHAR(30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE proveedores
        DROP COLUMN IF EXISTS categoria,
        DROP COLUMN IF EXISTS "diasPago",
        DROP COLUMN IF EXISTS banco,
        DROP COLUMN IF EXISTS "cuentaBancaria"
    `);
  }
}
