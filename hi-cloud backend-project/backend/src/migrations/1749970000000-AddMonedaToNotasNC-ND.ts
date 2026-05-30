import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonedaToNotasNCND1749970000000 implements MigrationInterface {
  name = 'AddMonedaToNotasNCND1749970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notas_credito
        ADD COLUMN IF NOT EXISTS moneda    VARCHAR(3)     NOT NULL DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4) NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE notas_debito
        ADD COLUMN IF NOT EXISTS moneda    VARCHAR(3)     NOT NULL DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4) NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notas_credito DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
    await queryRunner.query(`ALTER TABLE notas_debito  DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
  }
}
