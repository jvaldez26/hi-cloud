import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega la columna contadorPuedeVerAuditoria a la tabla empresa.
 *
 * Columna directa (no en el blob configuracion) — mismo criterio que
 * controlCajaActivo (ver 1757000000000-AddControlCajaActivo.ts): ningún
 * UPDATE parcial del JSON puede borrarla accidentalmente.
 *
 * Default TRUE — hoy el rol contador YA tiene acceso completo a Auditoría
 * (sin ninguna restricción); este ajuste da al Admin la opción de
 * RESTRINGIRLO, pero no debe cambiarle nada a nadie hasta que un Admin lo
 * decida explícitamente. Con default false, todas las empresas existentes
 * perderían de golpe algo que su contador ya usa — justo lo que el pedido
 * dice evitar.
 */
export class AddContadorPuedeVerAuditoria1768200000000 implements MigrationInterface {
  name = 'AddContadorPuedeVerAuditoria1768200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "contadorPuedeVerAuditoria" BOOLEAN NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE empresa
        DROP COLUMN IF EXISTS "contadorPuedeVerAuditoria"
    `);
  }
}
