import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega cajaDiariaId a recibos_cobro para imputar cada cobro
 * al cierre de caja del cajero que lo recibió.
 * Sin esto, todos los cierres mostraban el total de cobros de la empresa.
 */
export class RecibosCajaId1748600000000 implements MigrationInterface {
  name = 'RecibosCajaId1748600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE recibos_cobro
        ADD COLUMN IF NOT EXISTS "cajaDiariaId" INTEGER
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recibos_caja_diaria"
        ON recibos_cobro ("cajaDiariaId")
        WHERE "cajaDiariaId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recibos_caja_diaria"`);
    await queryRunner.query(`ALTER TABLE recibos_cobro DROP COLUMN IF EXISTS "cajaDiariaId"`);
  }
}
