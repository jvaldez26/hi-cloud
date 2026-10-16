import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo valor 'deposito_efectivo' en OrigenMovimiento — efectivo que sale de
 * una caja diaria y entra al banco (depósito físico, con volante). Antes no
 * existía ninguna forma correcta de registrar esto: el cobro en efectivo de
 * CxC #246 (empresa 53, 2026-10-15, RD$24,000) se posteó directo al banco
 * como si fuera un cobro bancario — nunca pasó por una caja. Ver
 * TesoreriaService.registrarDepositoEfectivo.
 */
export class AddDepositoEfectivoOrigenMovimientoBancario1787000000000 implements MigrationInterface {
  name = 'AddDepositoEfectivoOrigenMovimientoBancario1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "movimientos_bancarios_origen_enum" ADD VALUE IF NOT EXISTS 'deposito_efectivo'`);
  }

  public async down(): Promise<void> {
    // Postgres no permite quitar valores de un enum — mismo patrón que AddAjusteOrigenMovimientoBancario.
  }
}
