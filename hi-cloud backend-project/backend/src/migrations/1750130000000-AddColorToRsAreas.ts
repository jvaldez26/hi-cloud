import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColorToRsAreas1750130000000 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`
      ALTER TABLE rs_areas
        ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#3b82f6'
    `);
  }

  async down(qr: QueryRunner) {
    await qr.query(`ALTER TABLE rs_areas DROP COLUMN IF EXISTS color`);
  }
}
