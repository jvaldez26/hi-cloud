import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixProductosPorcentajeIva16a181753920000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE productos SET "porcentajeIva" = 18 WHERE "porcentajeIva" = 16`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No revertible: no sabemos cuáles eran legitimamente 16
  }
}
