import { MigrationInterface, QueryRunner } from 'typeorm';

/** Nuevos valores de TipoNotificacion para el aviso de bloqueo por intentos
 *  fallidos (login y supervisor) — ver notificacion-enviada.entity.ts. */
export class AddTiposNotificacionBloqueo1770200000000 implements MigrationInterface {
  name = 'AddTiposNotificacionBloqueo1770200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "notificaciones_enviadas_tipo_enum" ADD VALUE IF NOT EXISTS 'login_bloqueado'`);
    await queryRunner.query(`ALTER TYPE "notificaciones_enviadas_tipo_enum" ADD VALUE IF NOT EXISTS 'supervisor_bloqueado'`);
    await queryRunner.query(`ALTER TYPE "notificaciones_enviadas_tipo_enum" ADD VALUE IF NOT EXISTS 'posible_acceso_no_autorizado'`);
  }

  public async down(): Promise<void> {
    // Postgres no permite quitar valores de un enum — ver migraciones
    // previas del mismo tipo (AddTipoNotificacionXlink, AddTiposNotificacionCuotaEcf).
  }
}
