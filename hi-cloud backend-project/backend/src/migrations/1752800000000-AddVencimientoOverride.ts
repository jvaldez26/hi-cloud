import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVencimientoOverride1752800000000 implements MigrationInterface {
  name = 'AddVencimientoOverride1752800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE suscripciones ADD COLUMN IF NOT EXISTS "vencimientoOverride" DATE NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE suscripciones DROP COLUMN IF EXISTS "vencimientoOverride"`,
    );
  }
}
