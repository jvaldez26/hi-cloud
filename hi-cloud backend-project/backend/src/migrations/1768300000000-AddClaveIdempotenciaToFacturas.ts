import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotencia del checkout del POS — ver Factura.claveIdempotencia y
 * FacturasService.create().
 *
 * El índice único parcial (empresaId, claveIdempotencia) — solo sobre filas
 * con clave no nula — es lo que realmente cierra la carrera si dos
 * peticiones con la misma clave caen en el mismo instante: create() hace un
 * SELECT primero, pero entre ese SELECT y el INSERT puede colarse otra
 * petición idéntica (doble clic muy rápido, reintento de red). Sin el
 * índice, ambas pasarían el SELECT y se crearían dos facturas — exactamente
 * lo que esto previene.
 */
export class AddClaveIdempotenciaToFacturas1768300000000 implements MigrationInterface {
  name = 'AddClaveIdempotenciaToFacturas1768300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "claveIdempotencia" VARCHAR(36) DEFAULT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_facturas_empresaId_claveIdempotencia"
        ON facturas ("empresaId", "claveIdempotencia")
        WHERE "claveIdempotencia" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_facturas_empresaId_claveIdempotencia"`);
    await queryRunner.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "claveIdempotencia"
    `);
  }
}
