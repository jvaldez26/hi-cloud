import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prestamista Etapa 5, Parte B — ver docs/prestamista/etapa-5-contabilidad-caja-fiscal.md.
 *
 * Integra el efectivo de préstamos con el cierre de caja del cajero, mismo
 * patrón que gastos.cajaDiariaId (ver AddGastoCajaDiariaId1755200000000):
 * sin FK ni índice (consistente con esa migración — bajo volumen, nunca se
 * borra una caja), se llena solo cuando el método de pago es efectivo y el
 * cajero tiene una caja abierta.
 *
 * - pr_pagos.cajaDiariaId: cobro de cuota en efectivo imputado a esa caja.
 * - pr_desembolsos_parciales.cajaDiariaId: tramo de desembolso en efectivo
 *   (incluye el desembolso inicial — PrestamosService.crearEnTransaccion
 *   siempre inserta ahí, nunca hay un camino de desembolso que no pase por
 *   esta tabla).
 * - cierres_caja.cobrosPrestamoEfectivo / desembolsosPrestamoEfectivo:
 *   columnas que recalcularDesdeBD() llena a partir de las dos de arriba —
 *   mismo rol que cobrosEfectivo/gastosEfectivo. Default 0: una caja vieja
 *   (cerrada antes de este cambio) no tiene ningún préstamo que reatribuir.
 */
export class PrestamistaEtapa5CajaFiscal1781000000000 implements MigrationInterface {
  name = 'PrestamistaEtapa5CajaFiscal1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE pr_pagos
        ADD COLUMN IF NOT EXISTS "cajaDiariaId" INTEGER
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE pr_desembolsos_parciales
        ADD COLUMN IF NOT EXISTS "cajaDiariaId" INTEGER
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "cobrosPrestamoEfectivo" DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "desembolsosPrestamoEfectivo" DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "desembolsosPrestamoEfectivo",
        DROP COLUMN IF EXISTS "cobrosPrestamoEfectivo"
    `);
    await queryRunner.query(`
      ALTER TABLE pr_desembolsos_parciales DROP COLUMN IF EXISTS "cajaDiariaId"
    `);
    await queryRunner.query(`
      ALTER TABLE pr_pagos DROP COLUMN IF EXISTS "cajaDiariaId"
    `);
  }
}
