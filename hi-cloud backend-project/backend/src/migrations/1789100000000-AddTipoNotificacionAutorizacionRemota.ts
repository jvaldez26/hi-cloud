import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo valor de notificaciones_enviadas.tipo — aviso INMEDIATO (campanita,
 * canal SISTEMA) a ADMIN/CONTADOR cuando un cajero pide autorización remota
 * de supervisor desde el POS. Mismo criterio que
 * 1777100000000-AddTipoNotificacionDescuadreCaja.ts.
 */
export class AddTipoNotificacionAutorizacionRemota1789100000000 implements MigrationInterface {
  name = 'AddTipoNotificacionAutorizacionRemota1789100000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TYPE "notificaciones_enviadas_tipo_enum"
        ADD VALUE IF NOT EXISTS 'autorizacion_remota_solicitada'
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL no sabe quitar un valor de un enum — no-op deliberado,
    // mismo criterio que el resto de enums del proyecto.
  }
}
