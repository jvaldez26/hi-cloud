import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnulacionPendienteToFacturas1750320000000 implements MigrationInterface {
  name = 'AddAnulacionPendienteToFacturas1750320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "anulacionPendiente" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE notas_credito
        ADD COLUMN IF NOT EXISTS "efectosAplicados" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE facturas DROP COLUMN IF EXISTS "anulacionPendiente"`);
    await queryRunner.query(`ALTER TABLE notas_credito DROP COLUMN IF EXISTS "efectosAplicados"`);
  }
}
