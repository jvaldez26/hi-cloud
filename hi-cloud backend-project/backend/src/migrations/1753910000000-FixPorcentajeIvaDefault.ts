import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPorcentajeIvaDefault1753910000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE productos ALTER COLUMN "porcentajeIva" SET DEFAULT 18`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE productos ALTER COLUMN "porcentajeIva" SET DEFAULT 16`,
    );
  }
}
