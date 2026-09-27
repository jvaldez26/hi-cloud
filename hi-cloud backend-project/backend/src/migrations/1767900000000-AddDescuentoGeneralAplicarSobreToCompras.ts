import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescuentoGeneralAplicarSobreToCompras1767900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "compras"
        ADD COLUMN IF NOT EXISTS "descuentoGeneralAplicarSobre" VARCHAR(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "compras"
        DROP COLUMN IF EXISTS "descuentoGeneralAplicarSobre"
    `);
  }
}
