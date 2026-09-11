import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte de saldo propio por cargo y abono acumulado de la empresa, para la
 * imputación de pagos (cargos pendientes → períodos de plan → abono).
 *
 * - pagos_suscripcion."montoPagado": cuánto de un CARGO ya se liquidó. Solo
 *   se usa en filas tipo='CARGO' (default 0 — todos los cargos existentes
 *   quedan como totalmente pendientes, que es exactamente su estado real
 *   hoy). saldoPendiente de un cargo = monto - montoPagado.
 * - suscripciones."abonoDisponible": dinero ya pagado que no alcanzó para
 *   un período de plan ni se aplicó a ningún cargo — se suma al PRÓXIMO
 *   pago antes de volver a imputar, para que no quede huérfano.
 */
export class AddImputacionPagosSuscripcion1762800000000 implements MigrationInterface {
  name = 'AddImputacionPagosSuscripcion1762800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pagos_suscripcion"
        ADD COLUMN IF NOT EXISTS "montoPagado" NUMERIC(10,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "suscripciones"
        ADD COLUMN IF NOT EXISTS "abonoDisponible" NUMERIC(10,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "suscripciones"
        DROP COLUMN IF EXISTS "abonoDisponible"
    `);
    await queryRunner.query(`
      ALTER TABLE "pagos_suscripcion"
        DROP COLUMN IF EXISTS "montoPagado"
    `);
  }
}
