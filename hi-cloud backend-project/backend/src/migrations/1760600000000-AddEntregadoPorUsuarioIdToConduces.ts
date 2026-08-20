import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEntregadoPorUsuarioIdToConduces1760600000000 implements MigrationInterface {
  name = 'AddEntregadoPorUsuarioIdToConduces1760600000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE conduces
        ADD COLUMN IF NOT EXISTS "entregadoPorUsuarioId" INTEGER NULL
    `);
    await qr.query(`
      ALTER TABLE conduces
        ADD CONSTRAINT "FK_conduces_entregadoPorUsuarioId"
          FOREIGN KEY ("entregadoPorUsuarioId") REFERENCES users(id) ON DELETE SET NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE conduces
        DROP CONSTRAINT IF EXISTS "FK_conduces_entregadoPorUsuarioId"
    `);
    await qr.query(`ALTER TABLE conduces DROP COLUMN IF EXISTS "entregadoPorUsuarioId"`);
  }
}
