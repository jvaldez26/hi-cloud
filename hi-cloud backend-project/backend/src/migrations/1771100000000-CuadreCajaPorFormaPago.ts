import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cierre de caja por forma de pago — incidente real (empresa 73, Bellamar
 * González, 2026-10-09): el cierre solo cuadraba efectivo; una factura con
 * las formas de pago cambiadas entre sí (Tarjeta/Efectivo invertidos)
 * aparecía como "+829.94 SOBRANTE" en vez de señalar que era la tarjeta la
 * que faltaba.
 *
 * `cuadrePorFormaPago`/`facturasSinFormaPago` son snapshots calculados AL
 * CERRAR — igual que `saldoCierre`/`saldoFisico` ya existentes — para que
 * el reporte de un cierre viejo nunca cambie aunque después se corrija una
 * factura de ese turno (la corrección queda en `ajustes_cierre_caja`).
 */
export class CuadreCajaPorFormaPago1771100000000 implements MigrationInterface {
  name = 'CuadreCajaPorFormaPago1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "cuadrePorFormaPago" JSONB NULL,
        ADD COLUMN IF NOT EXISTS "facturasSinFormaPago" JSONB NULL,
        ADD COLUMN IF NOT EXISTS "sospechasFormaPago" JSONB NULL
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ajustes_cierre_caja (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "cierreCajaId" INTEGER NOT NULL,
        "facturaId" INTEGER NOT NULL,
        "facturaFolio" VARCHAR(30) NULL,
        "formasPagoAnterior" JSONB NOT NULL,
        "formasPagoNuevo" JSONB NOT NULL,
        motivo TEXT NOT NULL,
        "corregidoPor" INTEGER NOT NULL,
        "corregidoPorNombre" VARCHAR(150) NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ajustes_cierre_caja_cierre ON ajustes_cierre_caja("cierreCajaId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ajustes_cierre_caja_cierre`);
    await queryRunner.query(`DROP TABLE IF EXISTS ajustes_cierre_caja`);
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "sospechasFormaPago",
        DROP COLUMN IF EXISTS "facturasSinFormaPago",
        DROP COLUMN IF EXISTS "cuadrePorFormaPago"
    `);
  }
}
