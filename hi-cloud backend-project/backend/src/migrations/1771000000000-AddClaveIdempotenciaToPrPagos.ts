import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C1 (auditoría Prestamista Etapa 1) — ver PrPago.claveIdempotencia y
 * PagosService.registrar(). Mismo patrón exacto que
 * 1768300000000-AddClaveIdempotenciaToFacturas.ts y
 * 1769000000000-AddClaveIdempotenciaToCompras.ts.
 *
 * El índice único parcial (empresaId, claveIdempotencia) — solo sobre filas
 * con clave no nula — es lo que realmente cierra la carrera si dos
 * peticiones con la misma clave caen en el mismo instante: registrar() hace
 * un SELECT primero, pero entre ese SELECT y el INSERT puede colarse otra
 * petición idéntica (doble clic, reintento de red). Sin el índice, ambas
 * pasarían el SELECT y se aplicaría el mismo pago dos veces.
 */
export class AddClaveIdempotenciaToPrPagos1771000000000 implements MigrationInterface {
  name = 'AddClaveIdempotenciaToPrPagos1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_pagos
        ADD COLUMN IF NOT EXISTS "claveIdempotencia" VARCHAR(36) DEFAULT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pr_pagos_empresaId_claveIdempotencia"
        ON pr_pagos ("empresaId", "claveIdempotencia")
        WHERE "claveIdempotencia" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pr_pagos_empresaId_claveIdempotencia"`);
    await queryRunner.query(`
      ALTER TABLE pr_pagos
        DROP COLUMN IF EXISTS "claveIdempotencia"
    `);
  }
}
