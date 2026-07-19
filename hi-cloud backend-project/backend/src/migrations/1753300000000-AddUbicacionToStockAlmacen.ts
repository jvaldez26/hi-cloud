import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUbicacionToStockAlmacen1753300000000 implements MigrationInterface {
  name = 'AddUbicacionToStockAlmacen1753300000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE stock_almacen
       ADD COLUMN IF NOT EXISTS "ubicacionId" INTEGER NULL DEFAULT NULL
       REFERENCES wms_ubicaciones(id) ON DELETE SET NULL`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE stock_almacen DROP COLUMN IF EXISTS "ubicacionId"`);
  }
}
