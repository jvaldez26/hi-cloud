import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rastro de a qué CARGO se aplicó cada pago/crédito (auditoría 2026-10-06,
 * bug de saldo de MOTO REPUESTO MANOLIN SRL — Mi Suscripción mostraba
 * "Crédito disponible RD$5,600" mientras el panel de Cobros mostraba
 * "RD$10,000 pendiente" para la misma empresa, mismo momento).
 *
 * Antes, registrarPago()/confirmarTransferencia() liquidaban un cargo
 * (pagos_suscripcion.montoPagado) sin dejar ningún registro de QUÉ pago lo
 * liquidó — el Historial no podía mostrar "a qué se aplicó" cada pago, y
 * reconstruirlo a mano (como en esta misma auditoría) exigía adivinar por
 * fecha y monto.
 */
export class PagosAplicaciones1770800000000 implements MigrationInterface {
  name = 'PagosAplicaciones1770800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pagos_aplicaciones (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "pagoId"        INTEGER NOT NULL REFERENCES pagos_suscripcion(id),
        "cargoId"       INTEGER NOT NULL REFERENCES pagos_suscripcion(id),
        "montoAplicado" NUMERIC(10,2) NOT NULL,
        "creadoEn"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pagos_aplicaciones_pagoId" ON pagos_aplicaciones ("pagoId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pagos_aplicaciones_cargoId" ON pagos_aplicaciones ("cargoId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pagos_aplicaciones_empresa" ON pagos_aplicaciones ("empresaId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pagos_aplicaciones`);
  }
}
