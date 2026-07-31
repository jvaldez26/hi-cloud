import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiaCorte1754200000000 implements MigrationInterface {
  name = 'AddDiaCorte1754200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE suscripciones ADD COLUMN "diaCorte" SMALLINT`);
    await queryRunner.query(`
      UPDATE suscripciones
      SET "diaCorte" = EXTRACT(DAY FROM "fechaVencimiento")::smallint
    `);
    await queryRunner.query(`ALTER TABLE suscripciones ALTER COLUMN "diaCorte" SET NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE suscripciones DROP COLUMN "diaCorte"`);
  }
}
