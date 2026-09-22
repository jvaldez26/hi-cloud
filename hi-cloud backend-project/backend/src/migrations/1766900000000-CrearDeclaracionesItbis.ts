import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * declaraciones_itbis — snapshot del IT-1 por período, para que "Saldo a
 * Favor Anterior" (casilla 29) pueda leer el "Nuevo Saldo a Favor" (casilla
 * 34) del mes anterior de la misma empresa en vez de asumir 0 en silencio
 * (rebuild del IT-1, Commit 2 — Sección III Liquidación).
 */
export class CrearDeclaracionesItbis1766900000000 implements MigrationInterface {
  name = 'CrearDeclaracionesItbis1766900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS declaraciones_itbis (
        id                   SERIAL PRIMARY KEY,
        "isActive"           BOOLEAN NOT NULL DEFAULT true,
        "createdAt"          TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"          TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"          INTEGER,
        mes                  INTEGER NOT NULL,
        anio                 INTEGER NOT NULL,
        "diferenciaAPagar"   DECIMAL(14,2) NOT NULL DEFAULT 0,
        "nuevoSaldoAFavor"   DECIMAL(14,2) NOT NULL DEFAULT 0,
        "calculadoEn"        TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_declaraciones_itbis_empresa_periodo
        ON declaraciones_itbis ("empresaId", anio, mes)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS declaraciones_itbis`);
  }
}
