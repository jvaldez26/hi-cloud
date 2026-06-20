import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNivelToAuditLogs1750210000000 implements MigrationInterface {
  name = 'AddNivelToAuditLogs1750210000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE audit_logs
        ADD COLUMN IF NOT EXISTS nivel varchar(20) NOT NULL DEFAULT 'NORMAL'
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE audit_logs DROP COLUMN IF EXISTS nivel`);
  }
}
