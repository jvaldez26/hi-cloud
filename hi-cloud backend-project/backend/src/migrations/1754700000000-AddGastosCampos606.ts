import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega los dos campos fiscales que el Formato 606 exige y que la entidad
 * Gasto no tenía: tipoBienes (código oficial DGII 01-11) y formaPago (01-07).
 * Ambos son NULL por defecto — los gastos ya existentes no tienen este dato.
 * El 606 solo incluirá gastos que los tengan llenos (junto con NCF y RNC).
 */
export class AddGastosCampos6061754700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE gastos
        ADD COLUMN IF NOT EXISTS "tipoBienes" VARCHAR(2) NULL,
        ADD COLUMN IF NOT EXISTS "formaPago"  VARCHAR(2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE gastos
        DROP COLUMN IF EXISTS "tipoBienes",
        DROP COLUMN IF EXISTS "formaPago"
    `);
  }
}
