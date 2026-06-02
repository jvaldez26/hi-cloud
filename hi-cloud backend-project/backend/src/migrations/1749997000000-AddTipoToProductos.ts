import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipoToProductos1749997000000 implements MigrationInterface {
  name = 'AddTipoToProductos1749997000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'producto'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE productos DROP COLUMN IF EXISTS tipo`);
  }
}
