import { MigrationInterface, QueryRunner } from 'typeorm';

export class DecimalCantidadVentas1750040000000 implements MigrationInterface {
  name = 'DecimalCantidadVentas1750040000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── A1: cantidad int → decimal(12,4) en documentos de venta ────────────
    await qr.query(`
      ALTER TABLE factura_detalles
        ALTER COLUMN "cantidad" TYPE NUMERIC(12,4) USING "cantidad"::numeric
    `);
    await qr.query(`
      ALTER TABLE cotizacion_detalles
        ALTER COLUMN "cantidad" TYPE NUMERIC(12,4) USING "cantidad"::numeric
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE factura_detalles
        ALTER COLUMN "cantidad" TYPE INTEGER USING ROUND("cantidad")::integer
    `);
    await qr.query(`
      ALTER TABLE cotizacion_detalles
        ALTER COLUMN "cantidad" TYPE INTEGER USING ROUND("cantidad")::integer
    `);
  }
}
