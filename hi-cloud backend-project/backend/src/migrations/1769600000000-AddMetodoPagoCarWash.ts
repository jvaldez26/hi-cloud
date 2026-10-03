import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Método de pago de adelantos y liquidaciones de lavadores — 'efectivo'
 * (como hasta ahora, sale de caja) o 'transferencia' (no toca caja, solo
 * queda la referencia y, si existe, la cuenta bancaria destino).
 *
 * Sin FK física a cuentas_bancarias, igual que el resto del proyecto.
 */
export class AddMetodoPagoCarWash1769600000000 implements MigrationInterface {
  name = 'AddMetodoPagoCarWash1769600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE cw_adelantos
        ADD COLUMN IF NOT EXISTS "metodoPago" VARCHAR(20) NOT NULL DEFAULT 'efectivo',
        ADD COLUMN IF NOT EXISTS referencia TEXT,
        ADD COLUMN IF NOT EXISTS "cuentaBancariaId" INTEGER
    `);
    await queryRunner.query(`
      ALTER TABLE cw_liquidaciones
        ADD COLUMN IF NOT EXISTS "metodoPago" VARCHAR(20) NOT NULL DEFAULT 'efectivo',
        ADD COLUMN IF NOT EXISTS referencia TEXT,
        ADD COLUMN IF NOT EXISTS "cuentaBancariaId" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cw_liquidaciones
        DROP COLUMN IF EXISTS "cuentaBancariaId",
        DROP COLUMN IF EXISTS referencia,
        DROP COLUMN IF EXISTS "metodoPago"
    `);
    await queryRunner.query(`
      ALTER TABLE cw_adelantos
        DROP COLUMN IF EXISTS "cuentaBancariaId",
        DROP COLUMN IF EXISTS referencia,
        DROP COLUMN IF EXISTS "metodoPago"
    `);
  }
}
