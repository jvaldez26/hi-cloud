import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductoPrecisionDecimal1753800000000 implements MigrationInterface {
  name = 'ProductoPrecisionDecimal1753800000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE productos ALTER COLUMN precio      TYPE DECIMAL(14,4) USING precio::DECIMAL(14,4)`);
    await qr.query(`ALTER TABLE productos ALTER COLUMN precio2     TYPE DECIMAL(14,4) USING precio2::DECIMAL(14,4)`);
    await qr.query(`ALTER TABLE productos ALTER COLUMN precio3     TYPE DECIMAL(14,4) USING precio3::DECIMAL(14,4)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE productos ALTER COLUMN precio3     TYPE DECIMAL(12,2) USING precio3::DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE productos ALTER COLUMN precio2     TYPE DECIMAL(12,2) USING precio2::DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE productos ALTER COLUMN precio      TYPE DECIMAL(12,2) USING precio::DECIMAL(12,2)`);
  }
}
