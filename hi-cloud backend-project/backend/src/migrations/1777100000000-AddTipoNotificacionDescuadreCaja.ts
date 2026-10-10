import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo valor de notificaciones_enviadas.tipo para el aviso INMEDIATO
 * (campanita, canal SISTEMA, y correo) a ADMIN/CONTADOR: un cierre de caja
 * salió fuera del umbral de descuadre configurado. Mismo criterio que
 * 1770000000000-AddTipoNotificacionCajaHuerfana.ts.
 */
export class AddTipoNotificacionDescuadreCaja1777100000000 implements MigrationInterface {
  name = 'AddTipoNotificacionDescuadreCaja1777100000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TYPE "notificaciones_enviadas_tipo_enum"
        ADD VALUE IF NOT EXISTS 'descuadre_caja'
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL no sabe quitar un valor de un enum — no-op deliberado,
    // mismo criterio que el resto de enums del proyecto.
  }
}
