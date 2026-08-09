import { MigrationInterface, QueryRunner } from 'typeorm';

const TEMAS_TODOS = `'nube','marea','indigo','bosque','cemento','ciruela','bronce','cobalto','azul','verde','petroleo','violeta'`;

export class AddIntensePalettesToTemaSidebar1753950000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    // Reemplazar el CHECK para incluir las 5 paletas intensas nuevas
    await qr.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_tema_sidebar`);
    await qr.query(`ALTER TABLE users ADD CONSTRAINT chk_users_tema_sidebar CHECK ("temaSidebar" IN (${TEMAS_TODOS}))`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_tema_sidebar`);
    await qr.query(`ALTER TABLE users ADD CONSTRAINT chk_users_tema_sidebar CHECK ("temaSidebar" IN ('nube','marea','indigo','bosque','cemento','ciruela','bronce'))`);
  }
}
