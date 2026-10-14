import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix real (2026-10-14, empresa VENTAS DIVERSAS ELIDO): Bellamar hizo dos
 * ventas a crédito (FAC-1959, FAC-1967) con autorización de Beatriz como
 * supervisora, pero esas facturas nunca aparecieron en "Transacciones" del
 * reporte de Modo Supervisor (pestaña Auditoría).
 *
 * Causa: `finalizarAutorizacionSupervisor()` (auth.service.ts) inserta DOS
 * filas independientes por cada autorización en modo 'cada_vez' —
 * `pos_supervisor_log` (la fila que el reporte lista como "sesión") y
 * `supervisor_autorizaciones` (el token de un solo uso que
 * `validarAutorizacionVentaCredito()` consume y guarda en
 * `facturas.supervisorToken`) — sin ningún vínculo entre ambas. El reporte
 * (`listarSupervisorLog`) solo busca facturas por `supervisorSessionId`
 * (el id de `pos_supervisor_log`), que modo 'cada_vez' NUNCA llena — esa
 * columna es exclusiva del modo 'sesion' (ver el comentario de
 * `validarAutorizacionVentaCredito`). Toda venta autorizada con modo
 * 'cada_vez' (el modo real de VENTAS DIVERSAS ELIDO para 'venta_credito')
 * queda invisible en "Transacciones", aunque la autorización y la venta
 * fueron reales.
 *
 * Esta migración agrega el vínculo que faltaba y rellena el histórico:
 * `supervisor_autorizaciones."posSupervisorLogId"` apunta a la fila de
 * `pos_supervisor_log` de la MISMA autorización — ambas se insertan en la
 * misma llamada (mismo empresaId/cajeroId/supervisorId, mismo instante),
 * así que se correlacionan por el `pos_supervisor_log` más cercano en el
 * tiempo para ese trío, dentro de una ventana de 5 minutos (más que de
 * sobra: las dos INSERT ocurren en la misma petición HTTP).
 */
export class SupervisorAutorizacionPosLogId1783000000000 implements MigrationInterface {
  name = 'SupervisorAutorizacionPosLogId1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      ALTER TABLE supervisor_autorizaciones
        ADD COLUMN IF NOT EXISTS "posSupervisorLogId" INTEGER
    `);

    // Backfill: para cada fila sin vínculo, el pos_supervisor_log del mismo
    // trío (empresa, cajero, supervisor) con el createdAt más cercano,
    // dentro de 5 minutos — subconsulta correlacionada con LIMIT 1, un solo
    // candidato por fila, nunca un producto cartesiano.
    await queryRunner.query(`
      UPDATE supervisor_autorizaciones sa
      SET "posSupervisorLogId" = (
        SELECT p.id
        FROM pos_supervisor_log p
        WHERE p."empresaId" = sa."empresaId"
          AND p."cajeroId" = sa."cajeroId"
          AND p."supervisorId" = sa."supervisorId"
          AND ABS(EXTRACT(EPOCH FROM (p."createdAt" - sa."createdAt"))) <= 300
        ORDER BY ABS(EXTRACT(EPOCH FROM (p."createdAt" - sa."createdAt"))) ASC
        LIMIT 1
      )
      WHERE sa."posSupervisorLogId" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_supervisor_autorizaciones_pos_log
        ON supervisor_autorizaciones("posSupervisorLogId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_supervisor_autorizaciones_pos_log
    `);
    await queryRunner.query(`
      ALTER TABLE supervisor_autorizaciones
        DROP COLUMN IF EXISTS "posSupervisorLogId"
    `);
  }
}
