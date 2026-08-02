import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecuentoCamposLinea1754600000000 implements MigrationInterface {
  name = 'AddRecuentoCamposLinea1754600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE lineas_conteo
        ADD COLUMN IF NOT EXISTS "recuentadoPorId" INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS "recuentadaEn"    TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE lineas_conteo
        DROP COLUMN IF EXISTS "recuentadoPorId",
        DROP COLUMN IF EXISTS "recuentadaEn"
    `);
  }
}
