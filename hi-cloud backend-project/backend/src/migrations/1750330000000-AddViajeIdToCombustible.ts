import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddViajeIdToCombustible1750330000000 implements MigrationInterface {
  name = 'AddViajeIdToCombustible1750330000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE tr_combustible
        ADD COLUMN IF NOT EXISTS "viajeId" INTEGER REFERENCES tr_viajes(id) ON DELETE SET NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tr_combustible DROP COLUMN IF EXISTS "viajeId"`);
  }
}
