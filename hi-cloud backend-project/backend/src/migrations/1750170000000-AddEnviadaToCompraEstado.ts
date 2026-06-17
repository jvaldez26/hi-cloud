import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnviadaToCompraEstado1750170000000 implements MigrationInterface {
  name = 'AddEnviadaToCompraEstado1750170000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE compras_estado_enum ADD VALUE IF NOT EXISTS 'enviada' AFTER 'borrador';
      EXCEPTION WHEN others THEN NULL; END $$;
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Removing an enum value in PostgreSQL requires recreating the type — not implemented
  }
}
