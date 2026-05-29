import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipoPagoToCompras1749940000000 implements MigrationInterface {
  name = 'AddTipoPagoToCompras1749940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE compras
        ADD COLUMN IF NOT EXISTS "tipoPago"       VARCHAR(10)  DEFAULT 'credito',
        ADD COLUMN IF NOT EXISTS "diasCredito"    INT          DEFAULT 30,
        ADD COLUMN IF NOT EXISTS "fechaVencimiento" DATE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE compras
        DROP COLUMN IF EXISTS "tipoPago",
        DROP COLUMN IF EXISTS "diasCredito",
        DROP COLUMN IF EXISTS "fechaVencimiento"
    `);
  }
}
