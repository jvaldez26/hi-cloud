import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecibosCobrosMoneda1750310000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE recibos_cobro
        ADD COLUMN IF NOT EXISTS moneda varchar(3) NOT NULL DEFAULT 'DOP'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE recibos_cobro DROP COLUMN IF EXISTS moneda`);
  }
}
