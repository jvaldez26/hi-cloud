import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tarjeta física de supervisor (escaneo Code128/QR) — alternativa al PIN del
 * modal de Autorización de Supervisor del POS.
 *
 * - `tarjetas_supervisor`: una tarjeta ACTIVA por (userId, empresaId) —
 *   índice único parcial. Solo se guarda el hash (SHA-256, ver
 *   tarjeta-codigo.util.ts para por qué no bcrypt), nunca el código.
 * - `supervisor_tarjeta_config`: nivel de seguridad por empresa ('solo_tarjeta'
 *   default, o 'tarjeta_pin').
 * - `pos_supervisor_log."metodo"`: con qué credencial se autorizó cada
 *   sesión ('password' | 'pin' | 'tarjeta') — antes no se distinguía.
 */
export class TarjetasSupervisor1770900000000 implements MigrationInterface {
  name = 'TarjetasSupervisor1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tarjetas_supervisor (
        id                 SERIAL PRIMARY KEY,
        "userId"           INTEGER     NOT NULL,
        "empresaId"        INTEGER     NOT NULL,
        "codigoHash"       VARCHAR(64) NOT NULL,
        "ultimosCuatro"    VARCHAR(4)  NOT NULL,
        activa             BOOLEAN     NOT NULL DEFAULT true,
        "creadaPor"        INTEGER,
        "revocadaEn"       TIMESTAMPTZ,
        "revocadaPor"      INTEGER,
        "motivoRevocacion" TEXT,
        "creadaEn"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Lookup O(1) del escaneo — el hash es único en todo el sistema (dos
    // tarjetas de empresas distintas nunca pueden coincidir: la generación
    // es aleatoria de 128+ bits).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tarjetas_supervisor_hash" ON tarjetas_supervisor ("codigoHash")
    `);
    // Una sola tarjeta ACTIVA por persona y empresa — generar una nueva
    // desactiva la anterior (en la misma transacción del service), así que
    // este índice es más una garantía de invariante que algo que el service
    // dependa de violar-y-reintentar.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tarjetas_supervisor_activa_unica"
      ON tarjetas_supervisor ("userId", "empresaId") WHERE activa = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tarjetas_supervisor_empresa" ON tarjetas_supervisor ("empresaId") WHERE activa = true
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supervisor_tarjeta_config (
        "empresaId"      INTEGER PRIMARY KEY,
        nivel            VARCHAR(20) NOT NULL DEFAULT 'solo_tarjeta',
        "actualizadoPor" INTEGER,
        "actualizadoEn"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE pos_supervisor_log ADD COLUMN IF NOT EXISTS metodo VARCHAR(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pos_supervisor_log DROP COLUMN IF EXISTS metodo`);
    await queryRunner.query(`DROP TABLE IF EXISTS supervisor_tarjeta_config`);
    await queryRunner.query(`DROP TABLE IF EXISTS tarjetas_supervisor`);
  }
}
