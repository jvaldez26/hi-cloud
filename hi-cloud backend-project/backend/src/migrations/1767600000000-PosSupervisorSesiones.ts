import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sesiones de supervisor auditables de punta a punta (2026-09-25):
 *
 * - `pos_supervisor_log."sucursalId"`: caja/turno donde ocurrió el evento —
 *   ni la activación ni el cierre lo registraban.
 * - `pos_supervisor_log."sessionId"`: NULL en la fila de ACTIVACIÓN (la que
 *   ya existía: una por cada 8h de modo supervisor activo). Una fila de
 *   CIERRE apunta con este campo al `id` de la fila de activación que cierra
 *   — así "listar sesiones" es `WHERE "sessionId" IS NULL` y "el cierre de
 *   esta sesión" es `WHERE "sessionId" = :idDeActivacion`, sin tabla nueva:
 *   el `id` SERIAL que ya tenía la fila de activación ES el id de sesión.
 * - `facturas."supervisorSessionId"`: qué factura (venta) se creó mientras
 *   esa sesión estaba activa — apunta al mismo `id` de la fila de
 *   activación. Antes de esto, una venta hecha bajo modo supervisor ya
 *   activo no dejaba NINGÚN rastro (solo la primera acción del período
 *   disparaba una fila en pos_supervisor_log; el resto de la sesión era
 *   invisible).
 */
export class PosSupervisorSesiones1767600000000 implements MigrationInterface {
  name = 'PosSupervisorSesiones1767600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE pos_supervisor_log
        ADD COLUMN IF NOT EXISTS "sucursalId" INTEGER,
        ADD COLUMN IF NOT EXISTS "sessionId"  INTEGER
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pos_sup_log_sessionId"
        ON pos_supervisor_log ("sessionId")
    `);

    await queryRunner.query(`
      ALTER TABLE facturas ADD COLUMN IF NOT EXISTS "supervisorSessionId" INTEGER
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_facturas_supervisorSessionId"
        ON facturas ("supervisorSessionId")
        WHERE "supervisorSessionId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_facturas_supervisorSessionId"`);
    await queryRunner.query(`ALTER TABLE facturas DROP COLUMN IF EXISTS "supervisorSessionId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pos_sup_log_sessionId"`);
    await queryRunner.query(`
      ALTER TABLE pos_supervisor_log
        DROP COLUMN IF EXISTS "sessionId",
        DROP COLUMN IF EXISTS "sucursalId"
    `);
  }
}
