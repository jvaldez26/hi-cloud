import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo valor 'ajuste' en OrigenMovimiento — ver AjustarSaldoDto en
 * tesoreria/dto/registrar-movimiento.dto.ts. Incidente 2026-10-15 (empresa
 * 53): el saldo de una cuenta bancaria pudo quedar en RD$24,000 sin ningún
 * movimiento ni motivo que lo explique. De ahora en adelante, la ÚNICA forma
 * de cambiar un saldo fuera de depósito/retiro/transferencia normal es un
 * ajuste con motivo obligatorio — se audita igual que cualquier movimiento.
 */
export class AddAjusteOrigenMovimientoBancario1785000000000 implements MigrationInterface {
  name = 'AddAjusteOrigenMovimientoBancario1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "movimientos_bancarios_origen_enum" ADD VALUE IF NOT EXISTS 'ajuste'`);
  }

  public async down(): Promise<void> {
    // Postgres no permite quitar valores de un enum — mismo patrón que
    // AddTiposNotificacionBloqueo y otras migraciones de este tipo.
  }
}
