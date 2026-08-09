import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTemaSidebarToUsers1753940000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "temaSidebar" VARCHAR(20) NOT NULL DEFAULT 'nube'
    `);
    await qr.query(`
      ALTER TABLE users
        ADD CONSTRAINT chk_users_tema_sidebar
          CHECK ("temaSidebar" IN ('nube','marea','indigo','bosque','cemento','ciruela','bronce'))
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_tema_sidebar`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS "temaSidebar"`);
  }
}
