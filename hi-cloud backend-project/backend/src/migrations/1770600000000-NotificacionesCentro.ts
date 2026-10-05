import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte de datos para el centro de notificaciones unificado:
 *   - notificaciones_enviadas: + empresaId (para no mezclar empresas de un
 *     usuario con varias), + leido/leidoEn (ya es una fila por destinatario,
 *     así que el estado de lectura va directo en la fila, sin tabla aparte).
 *   - alertas_vistas: una fila por (empresa, usuario, tipo de alerta) con la
 *     "huella" del estado que el usuario ya vio — si la huella cambia (nuevos
 *     productos entran en stock bajo, etc.) la alerta vuelve a contar aunque
 *     ya se hubiera marcado como vista. pospuestoHasta soporta "posponer 1 día".
 *   - users: + preferenciasNotificaciones (jsonb) — qué tipos tiene
 *     desactivados cada usuario. Ausente = activado (no hace falta backfill).
 */
export class NotificacionesCentro1770600000000 implements MigrationInterface {
  name = 'NotificacionesCentro1770600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum de Postgres — "e-CF en revisión manual" (consultar-estado-ecf.job.ts)
    // hoy solo manda un correo; con este valor puede además dejar la fila
    // canal=SISTEMA que la campanita unificada necesita. Mismo patrón que
    // 1762000000000-AddTiposNotificacionCuotaEcf.
    await queryRunner.query(`
      ALTER TYPE "notificaciones_enviadas_tipo_enum"
        ADD VALUE IF NOT EXISTS 'ecf_revision_manual'
    `);

    await queryRunner.query(`
      ALTER TABLE notificaciones_enviadas
        ADD COLUMN IF NOT EXISTS "empresaId" INTEGER,
        ADD COLUMN IF NOT EXISTS leido BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "leidoEn" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_enviadas_user_empresa_leido
        ON notificaciones_enviadas ("userId", "empresaId", leido)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS alertas_vistas (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER      NOT NULL,
        "userId"         INTEGER      NOT NULL,
        tipo             VARCHAR(50)  NOT NULL,
        huella           TEXT         NOT NULL,
        "vistoHasta"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "pospuestoHasta" TIMESTAMPTZ,
        UNIQUE ("empresaId", "userId", tipo)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "preferenciasNotificaciones" JSONB NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "preferenciasNotificaciones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS alertas_vistas`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notif_enviadas_user_empresa_leido`);
    await queryRunner.query(`
      ALTER TABLE notificaciones_enviadas
        DROP COLUMN IF EXISTS "empresaId",
        DROP COLUMN IF EXISTS leido,
        DROP COLUMN IF EXISTS "leidoEn"
    `);
  }
}
