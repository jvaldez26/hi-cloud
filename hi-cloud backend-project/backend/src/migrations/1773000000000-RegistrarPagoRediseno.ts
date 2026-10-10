import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rediseño de "Registrar Pago" (precursor de Etapa 2) — ver
 * docs/prestamista/registrar-pago-rediseno.md.
 *
 * `tipoPago`/`formasPago`/`montoExtraCapital` son nuevas en pr_pagos —
 * ninguna tenía columna. `fecha` ya existía (default NOW()); no se toca su
 * definición, solo ahora el INSERT la pasa explícita cuando el pago es con
 * fecha anterior.
 */
export class RegistrarPagoRediseno1773000000000 implements MigrationInterface {
  name = 'RegistrarPagoRediseno1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_pagos
        ADD COLUMN IF NOT EXISTS "tipoPago" VARCHAR(40) NOT NULL DEFAULT 'cuotas',
        ADD COLUMN IF NOT EXISTS "formasPago" JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "montoExtraCapital" DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pr_pagos
        DROP COLUMN IF EXISTS "montoExtraCapital",
        DROP COLUMN IF EXISTS "formasPago",
        DROP COLUMN IF EXISTS "tipoPago"
    `);
  }
}
