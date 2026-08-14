import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega cajaDiariaId a la tabla gastos.
 *
 * Permite imputar gastos en efectivo a una caja específica, igual que retiros_caja.
 * Con esta FK, recalcularDesdeBD() puede deducir gastosEfectivo en empresas
 * con múltiples cajeros (antes solo funcionaba en cajas sin vendedorId).
 *
 * El campo solo se llena cuando formaPago='01' (efectivo) y el usuario selecciona
 * la caja en el formulario. Los gastos existentes quedan con cajaDiariaId=NULL
 * y no se imputan a ninguna caja (no es posible la atribución retroactiva).
 */
export class AddGastoCajaDiariaId1755200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE gastos
        ADD COLUMN IF NOT EXISTS "cajaDiariaId" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE gastos
        DROP COLUMN IF EXISTS "cajaDiariaId"
    `);
  }
}
