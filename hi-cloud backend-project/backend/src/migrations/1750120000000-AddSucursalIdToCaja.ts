import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSucursalIdToCaja1750120000000 implements MigrationInterface {
  name = 'AddSucursalIdToCaja1750120000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS "sucursalId" INTEGER`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE cierres_caja DROP COLUMN IF EXISTS "sucursalId"`);
  }
}
