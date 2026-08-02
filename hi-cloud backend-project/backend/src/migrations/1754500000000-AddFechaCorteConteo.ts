import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFechaCorteConteo1754500000000 implements MigrationInterface {
  name = 'AddFechaCorteConteo1754500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    // Por defecto = fechaGeneracion, pero como ya fue creada con NOW() en la
    // migración anterior, lo más cercano es usar NOW() para filas existentes.
    // En producción la tabla tiene 0 filas así que el DEFAULT es suficiente.
    await queryRunner.query(`
      ALTER TABLE conteos_inventario
      ADD COLUMN IF NOT EXISTS "fechaCorteConteo" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE conteos_inventario DROP COLUMN IF EXISTS "fechaCorteConteo"
    `);
  }
}
