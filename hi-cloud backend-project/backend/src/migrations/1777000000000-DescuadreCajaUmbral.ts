import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Columnas para "fuera de umbral" (ver fueraDeUmbral() en
 * cuadre-por-forma-pago.util.ts) y la aprobación de un descuadre por
 * ADMIN/CONTADOR — decisión explícita 2026-10-10: el umbral se evalúa por
 * cada forma de pago Y por el neto, siempre al cerrar (no solo con el
 * cierre ciego activo), y queda marcado en el cierre hasta que alguien lo
 * aprueba con motivo.
 */
export class DescuadreCajaUmbral1777000000000 implements MigrationInterface {
  name = 'DescuadreCajaUmbral1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "fueraDeUmbral" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "motivoAprobacionDescuadre" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "aprobadoPorUsuarioId" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "aprobadoPorNombre" VARCHAR(120) NULL,
        ADD COLUMN IF NOT EXISTS "aprobadoEn" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "aprobadoEn",
        DROP COLUMN IF EXISTS "aprobadoPorNombre",
        DROP COLUMN IF EXISTS "aprobadoPorUsuarioId",
        DROP COLUMN IF EXISTS "motivoAprobacionDescuadre",
        DROP COLUMN IF EXISTS "fueraDeUmbral"
    `);
  }
}
