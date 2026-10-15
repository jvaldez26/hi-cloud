import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría de reimpresiones de factura (política 'reimprimir_factura'): una
 * fila por cada reimpresión, con el número consecutivo de reimpresión para
 * esa factura ("REIMPRESIÓN #N" en el ticket), quién la hizo, el motivo o el
 * supervisor que autorizó (nunca ambos vacíos — el servicio exige uno u
 * otro), el formato impreso y, si había una caja abierta, a cuál turno
 * pertenece. Ver facturas.service.ts.reimprimir().
 */
export class FacturaReimpresiones1784000000000 implements MigrationInterface {
  name = 'FacturaReimpresiones1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS factura_reimpresiones (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "facturaId" INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
        numero INTEGER NOT NULL,
        "usuarioId" INTEGER NOT NULL,
        "usuarioNombre" VARCHAR(150),
        formato VARCHAR(10) NOT NULL,
        motivo VARCHAR(300),
        "supervisorId" INTEGER,
        "supervisorNombre" VARCHAR(150),
        "cajaId" INTEGER,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_factura_reimpresiones_facturaId" ON factura_reimpresiones ("facturaId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_factura_reimpresiones_empresaId" ON factura_reimpresiones ("empresaId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS factura_reimpresiones`);
  }
}
