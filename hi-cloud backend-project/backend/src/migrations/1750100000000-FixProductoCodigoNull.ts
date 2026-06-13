import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixProductoCodigoNull1750100000000 implements MigrationInterface {
  name = 'FixProductoCodigoNull1750100000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE productos
      SET codigo = CONCAT('PROD-', LPAD(id::text, 4, '0'))
      WHERE (codigo IS NULL OR codigo = '')
        AND "isActive" = true
    `);
  }

  async down(_qr: QueryRunner): Promise<void> {
    // No revertir: no sabemos cuáles eran NULL antes
  }
}
