import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Alerta de nuevo dispositivo/ubicación al iniciar sesión (2026-09-25):
 *
 * - "dispositivos_conocidos": un fingerprint por navegador/dispositivo YA
 *   VISTO de un usuario (fingerprint = hash del User-Agent normalizado, NO
 *   de la IP — así un login desde la misma app/navegador con IP móvil
 *   distinta sigue siendo "el mismo dispositivo", que es justo lo que evita
 *   el spam de notificaciones al cambiar de red). "pais"/"ip" son el último
 *   visto, solo informativos para el correo de alerta — la identidad del
 *   dispositivo es el fingerprint, no estos dos campos.
 * - "alerta_dispositivo_tokens": token de un solo uso para el enlace "No fui
 *   yo" del correo de alerta — mismo patrón que setup_tokens (hash SHA-256
 *   guardado, nunca el token en claro; expira a las 24h; se marca `used` al
 *   consumirse), pero en tabla separada porque es un flujo distinto
 *   (confirmar un login sospechoso, no configurar la contraseña inicial).
 */
export class CrearAlertaDispositivoConocido1767500000000 implements MigrationInterface {
  name = 'CrearAlertaDispositivoConocido1767500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispositivos_conocidos (
        id            UUID         PRIMARY KEY,
        "userId"      INTEGER      NOT NULL,
        fingerprint   VARCHAR(64)  NOT NULL,
        ip            VARCHAR(45),
        "userAgent"   VARCHAR(255),
        pais          VARCHAR(2),
        "primeraVez"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "ultimaVez"   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_dispositivos_conocidos_userId_fingerprint"
        ON dispositivos_conocidos("userId", fingerprint)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS alerta_dispositivo_tokens (
        id           UUID         PRIMARY KEY,
        "userId"     INTEGER      NOT NULL,
        "tokenHash"  VARCHAR(64)  NOT NULL UNIQUE,
        "expiresAt"  TIMESTAMPTZ  NOT NULL,
        used         BOOLEAN      NOT NULL DEFAULT false,
        "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_alerta_dispositivo_tokens_tokenHash"
        ON alerta_dispositivo_tokens("tokenHash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`DROP TABLE IF EXISTS alerta_dispositivo_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS dispositivos_conocidos`);
  }
}
