import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preserva el cuadre por forma de pago del PRIMER cierre al recerrar —
 * mismo criterio que esperadoOriginal/contadoOriginal/diferenciaOriginal
 * (ya existentes): sin esto, anularCierre() + un recierre sobrescribían
 * cuadrePorFormaPago/facturasSinFormaPago/sospechasFormaPago sin dejar
 * rastro de lo que el primer cajero declaró por forma de pago (bug real,
 * 2026-10-10 — el recierre de Beatriz Riva a nombre de Bellamar González
 * perdió la tarjeta 2,605.00 esperada del primer cierre sin que quedara
 * ningún registro del cuadre original).
 */
export class CuadrePorFormaPagoOriginal1776000000000 implements MigrationInterface {
  name = 'CuadrePorFormaPagoOriginal1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "cuadrePorFormaPagoOriginal" JSONB NULL,
        ADD COLUMN IF NOT EXISTS "facturasSinFormaPagoOriginal" JSONB NULL,
        ADD COLUMN IF NOT EXISTS "sospechasFormaPagoOriginal" JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "sospechasFormaPagoOriginal",
        DROP COLUMN IF EXISTS "facturasSinFormaPagoOriginal",
        DROP COLUMN IF EXISTS "cuadrePorFormaPagoOriginal"
    `);
  }
}
