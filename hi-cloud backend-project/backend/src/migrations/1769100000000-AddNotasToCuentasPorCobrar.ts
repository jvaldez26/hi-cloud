import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Texto libre para dejar constancia de por qué una CxC se cerró fuera del
 * flujo normal de cobro — primer uso: EcfEfectosNcService, al cerrar la CxC
 * de una factura cancelada por una Nota de Crédito código 1 (anulación
 * total). Antes no existía ningún campo así en cuentas_por_cobrar.
 */
export class AddNotasToCuentasPorCobrar1769100000000 implements MigrationInterface {
  name = 'AddNotasToCuentasPorCobrar1769100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cuentas_por_cobrar
        ADD COLUMN IF NOT EXISTS notas TEXT DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cuentas_por_cobrar
        DROP COLUMN IF EXISTS notas
    `);
  }
}
