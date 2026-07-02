import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdenCompraFormasPagoToFacturas1750370000000 implements MigrationInterface {
  name = 'AddOrdenCompraFormasPagoToFacturas1750370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "ordenCompraNumero" VARCHAR(100) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "ordenCompraUrl"    TEXT         DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "formasPago"        JSONB        DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "ordenCompraNumero",
        DROP COLUMN IF EXISTS "ordenCompraUrl",
        DROP COLUMN IF EXISTS "formasPago"
    `);
  }
}
