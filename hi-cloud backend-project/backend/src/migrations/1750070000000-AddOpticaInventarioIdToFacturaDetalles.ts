import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpticaInventarioIdToFacturaDetalles1750070000000 implements MigrationInterface {
  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE factura_detalles
        ADD COLUMN IF NOT EXISTS "opticaInventarioId" integer;
    `);
  }
  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE factura_detalles DROP COLUMN IF EXISTS "opticaInventarioId";`);
  }
}
