import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotencia de la recuperación de borradores (Fase 2) — ver
 * Compra.claveIdempotencia y ComprasService.create(). Mismo patrón exacto
 * que 1768300000000-AddClaveIdempotenciaToFacturas.ts.
 *
 * El índice único parcial (empresaId, claveIdempotencia) — solo sobre filas
 * con clave no nula — es lo que realmente cierra la carrera si dos
 * peticiones con la misma clave caen en el mismo instante: create() hace un
 * SELECT primero, pero entre ese SELECT y el INSERT puede colarse otra
 * petición idéntica. Sin el índice, ambas pasarían el SELECT y se crearían
 * dos compras — exactamente lo que esto previene.
 */
export class AddClaveIdempotenciaToCompras1769000000000 implements MigrationInterface {
  name = 'AddClaveIdempotenciaToCompras1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE compras
        ADD COLUMN IF NOT EXISTS "claveIdempotencia" VARCHAR(36) DEFAULT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compras_empresaId_claveIdempotencia"
        ON compras ("empresaId", "claveIdempotencia")
        WHERE "claveIdempotencia" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compras_empresaId_claveIdempotencia"`);
    await queryRunner.query(`
      ALTER TABLE compras
        DROP COLUMN IF EXISTS "claveIdempotencia"
    `);
  }
}
