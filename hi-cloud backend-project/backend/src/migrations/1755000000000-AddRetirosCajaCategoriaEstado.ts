import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extiende retiros_caja con:
 * - categoria: tipo de egreso (pago_proveedor | deposito_banco | gasto | prestamo_dueno | otro)
 * - estado: activo | pendiente | anulado
 * - traza de autorización (autorizadorId, autorizadorNombre, autorizadoEn)
 * - traza de anulación  (motivoAnulacion, anuladoPorId, anuladoPorNombre, anuladoEn)
 * - cuentaBancariaId: vínculo opcional al módulo de Bancos cuando categoria = deposito_banco
 */
export class AddRetirosCajaCategoriaEstado1755000000000 implements MigrationInterface {
  name = 'AddRetirosCajaCategoriaEstado1755000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE retiros_caja
        ADD COLUMN IF NOT EXISTS categoria          VARCHAR(30)   NOT NULL DEFAULT 'otro',
        ADD COLUMN IF NOT EXISTS estado             VARCHAR(20)   NOT NULL DEFAULT 'activo',
        ADD COLUMN IF NOT EXISTS "autorizadorId"    INTEGER,
        ADD COLUMN IF NOT EXISTS "autorizadorNombre" VARCHAR(150),
        ADD COLUMN IF NOT EXISTS "autorizadoEn"     TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "motivoAnulacion"  VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "anuladoPorId"     INTEGER,
        ADD COLUMN IF NOT EXISTS "anuladoPorNombre" VARCHAR(150),
        ADD COLUMN IF NOT EXISTS "anuladoEn"        TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "cuentaBancariaId" INTEGER
    `);

    /* Índice parcial: los anulados/pendientes son minoría → búsqueda rápida por estado */
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_retiros_estado_empresa"
        ON retiros_caja (estado, "empresaId")
        WHERE estado != 'activo'
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "IDX_retiros_estado_empresa"`);
    await qr.query(`
      ALTER TABLE retiros_caja
        DROP COLUMN IF EXISTS categoria,
        DROP COLUMN IF EXISTS estado,
        DROP COLUMN IF EXISTS "autorizadorId",
        DROP COLUMN IF EXISTS "autorizadorNombre",
        DROP COLUMN IF EXISTS "autorizadoEn",
        DROP COLUMN IF EXISTS "motivoAnulacion",
        DROP COLUMN IF EXISTS "anuladoPorId",
        DROP COLUMN IF EXISTS "anuladoPorNombre",
        DROP COLUMN IF EXISTS "anuladoEn",
        DROP COLUMN IF EXISTS "cuentaBancariaId"
    `);
  }
}
