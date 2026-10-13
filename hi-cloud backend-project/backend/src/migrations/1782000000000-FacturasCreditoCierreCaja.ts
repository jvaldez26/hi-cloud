import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix del cuadre de caja (2026-10-13): las facturas a CRÉDITO (tipoPago
 * 'CREDITO') se sumaban al esperado de "Otros" del cuadre por forma de pago
 * — no son dinero en caja, generaban un faltante falso. Ahora quedan fuera
 * del cuadre, igual que las facturas CONTADO sin forma de pago
 * (facturasSinFormaPago), y se muestran aparte como dato informativo.
 *
 * Mismo patrón que facturasSinFormaPago/facturasSinFormaPagoOriginal (ver
 * CierreCaja): snapshot JSONB calculado AL CERRAR, nunca recalculado
 * después; la columna "Original" preserva el valor del PRIMER cierre al
 * recerrar.
 */
export class FacturasCreditoCierreCaja1782000000000 implements MigrationInterface {
  name = 'FacturasCreditoCierreCaja1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "facturasCredito" JSONB,
        ADD COLUMN IF NOT EXISTS "facturasCreditoOriginal" JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        DROP COLUMN IF EXISTS "facturasCreditoOriginal",
        DROP COLUMN IF EXISTS "facturasCredito"
    `);
  }
}
