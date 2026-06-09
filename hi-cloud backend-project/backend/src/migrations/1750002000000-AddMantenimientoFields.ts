import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMantenimientoFields1750002000000 implements MigrationInterface {
  name = 'AddMantenimientoFields1750002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE activos_fijos
        ADD COLUMN IF NOT EXISTS "fechaUltimoMantenimiento" date
    `);
    await queryRunner.query(`
      ALTER TABLE ordenes_mantenimiento
        ADD COLUMN IF NOT EXISTS "repuestosUsados" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ordenes_mantenimiento DROP COLUMN IF EXISTS "repuestosUsados"`);
    await queryRunner.query(`ALTER TABLE activos_fijos DROP COLUMN IF EXISTS "fechaUltimoMantenimiento"`);
  }
}
