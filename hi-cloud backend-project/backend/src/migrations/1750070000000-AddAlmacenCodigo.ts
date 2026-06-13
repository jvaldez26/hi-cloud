import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlmacenCodigo1750070000000 implements MigrationInterface {
  name = 'AddAlmacenCodigo1750070000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE almacenes ADD COLUMN IF NOT EXISTS "codigo" VARCHAR(20)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE almacenes DROP COLUMN IF EXISTS "codigo"`);
  }
}
