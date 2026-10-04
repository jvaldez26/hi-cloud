import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo valor de notificaciones_enviadas.tipo para el aviso diario (campanita,
 * canal SISTEMA) a ADMIN/CONTADOR: hay una caja abierta de un día anterior
 * sin cerrar. Mismo criterio que 1768800000000-AddTipoNotificacionXlink.ts.
 */
export class AddTipoNotificacionCajaHuerfana1770000000000 implements MigrationInterface {
  name = 'AddTipoNotificacionCajaHuerfana1770000000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TYPE "notificaciones_enviadas_tipo_enum"
        ADD VALUE IF NOT EXISTS 'caja_huerfana'
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL no sabe quitar un valor de un enum — no-op deliberado,
    // mismo criterio que el resto de enums del proyecto.
  }
}
