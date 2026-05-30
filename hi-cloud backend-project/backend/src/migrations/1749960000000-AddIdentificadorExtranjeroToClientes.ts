import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdentificadorExtranjeroToClientes1749960000000 implements MigrationInterface {
  name = 'AddIdentificadorExtranjeroToClientes1749960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE clientes
        ADD COLUMN IF NOT EXISTS "identificadorExtranjero" VARCHAR(30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE clientes DROP COLUMN IF EXISTS "identificadorExtranjero"
    `);
  }
}
