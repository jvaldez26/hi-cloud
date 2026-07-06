import { MigrationInterface, QueryRunner } from 'typeorm';

export class DecimalCantidadComprasYDevoluciones1750100002000 implements MigrationInterface {
  name = 'DecimalCantidadComprasYDevoluciones1750100002000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE compra_detalles
        ALTER COLUMN cantidad TYPE DECIMAL(12,4) USING cantidad::DECIMAL(12,4)
    `);
    await qr.query(`
      ALTER TABLE devolucion_detalles
        ALTER COLUMN cantidad TYPE DECIMAL(12,4) USING cantidad::DECIMAL(12,4)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE compra_detalles
        ALTER COLUMN cantidad TYPE INTEGER USING cantidad::INTEGER
    `);
    await qr.query(`
      ALTER TABLE devolucion_detalles
        ALTER COLUMN cantidad TYPE INTEGER USING cantidad::INTEGER
    `);
  }
}
