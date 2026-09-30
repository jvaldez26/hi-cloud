import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HiCloud Xlink — nuevo valor de notificaciones_enviadas.tipo para el aviso
 * "llegó un documento nuevo" (canal SISTEMA, para la campanita). Mismo
 * criterio que 1762000000000-AddTiposNotificacionCuotaEcf.ts: ADD VALUE es
 * legal dentro de la transacción de la migración en PG 12+, siempre que el
 * valor no se USE en esa misma transacción — solo se declara aquí.
 */
export class AddTipoNotificacionXlink1768800000000 implements MigrationInterface {
  name = 'AddTipoNotificacionXlink1768800000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TYPE "notificaciones_enviadas_tipo_enum"
        ADD VALUE IF NOT EXISTS 'xlink_documento_recibido'
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL no sabe quitar un valor de un enum — no-op deliberado,
    // mismo criterio que el resto de enums del proyecto.
  }
}
