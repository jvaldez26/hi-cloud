import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lavadores, comisiones, adelantos y liquidaciones de Car Wash.
 *
 * Diseño de comisiones (una fila por lavador asignado al turno, o por
 * lavador+servicio cuando el modo de pago es 'por_servicio'):
 *   - 'por_vehiculo' y 'porcentaje': UNA fila por lavador y turno
 *     (servicioId NULL) — el monto fijo o el % del subtotal aplica una vez
 *     por vehículo, no por cada servicio que traiga.
 *   - 'por_servicio': UNA fila por lavador y servicio del turno.
 *
 * Como Postgres no considera iguales dos NULL para UNIQUE, un índice único
 * plano (turnoId, lavadorId, servicioId) NO evita duplicar las filas con
 * servicioId NULL si la generación de comisiones se reintenta — por eso el
 * índice usa COALESCE(servicioId, 0) para tratar "sin servicio" como un
 * valor fijo y sí bloquear el duplicado.
 */
export class CreateCarWashLavadores1769500000000 implements MigrationInterface {
  name = 'CreateCarWashLavadores1769500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE cw_servicio_precios ADD COLUMN IF NOT EXISTS "tarifaLavador" DECIMAL(10,2)
    `);

    // ── cw_lavadores ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_lavadores (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        nombre          VARCHAR(150) NOT NULL,
        cedula          VARCHAR(20),
        telefono        VARCHAR(20),
        activo          BOOLEAN NOT NULL DEFAULT true,
        "modoPago"      VARCHAR(20) NOT NULL,
        "valorModoPago" DECIMAL(10,2) NOT NULL DEFAULT 0,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "ck_cw_lavador_modo_pago"
          CHECK ("modoPago" IN ('por_vehiculo', 'porcentaje', 'por_servicio'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_lavadores_empresa" ON cw_lavadores ("empresaId")
    `);

    // ── cw_turno_lavadores (asignación N lavadores por turno) ──────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_turno_lavadores (
        id           SERIAL PRIMARY KEY,
        "turnoId"    INTEGER NOT NULL,
        "lavadorId"  INTEGER NOT NULL,
        porcentaje   DECIMAL(5,2) NOT NULL,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_cw_turno_lavador" UNIQUE ("turnoId", "lavadorId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_turno_lavadores_turno" ON cw_turno_lavadores ("turnoId")
    `);

    // ── cw_comisiones ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_comisiones (
        id                   SERIAL PRIMARY KEY,
        "empresaId"          INTEGER NOT NULL,
        "turnoId"            INTEGER NOT NULL,
        "lavadorId"          INTEGER NOT NULL,
        "servicioId"         INTEGER,
        "servicioNombre"     VARCHAR(150),
        "modoPago"           VARCHAR(20) NOT NULL,
        base                 DECIMAL(10,2) NOT NULL,
        "tarifaAplicada"     DECIMAL(10,2) NOT NULL,
        "porcentajeReparto"  DECIMAL(5,2) NOT NULL,
        monto                DECIMAL(10,2) NOT NULL,
        fecha                DATE NOT NULL,
        estado               VARCHAR(20) NOT NULL DEFAULT 'activa',
        "motivoAnulacion"    TEXT,
        "anuladoPorId"       INTEGER,
        "anuladoAt"          TIMESTAMP,
        "liquidacionId"      INTEGER,
        "createdAt"          TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "ck_cw_comision_estado" CHECK (estado IN ('activa', 'anulada'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_cw_comision_linea"
        ON cw_comisiones ("turnoId", "lavadorId", COALESCE("servicioId", 0))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_comisiones_lavador_fecha" ON cw_comisiones ("empresaId", "lavadorId", fecha)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_comisiones_liquidacion" ON cw_comisiones ("liquidacionId")
    `);

    // ── cw_adelantos ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_adelantos (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "lavadorId"      INTEGER NOT NULL,
        monto            DECIMAL(10,2) NOT NULL,
        fecha            DATE NOT NULL,
        motivo           TEXT,
        "usuarioId"      INTEGER NOT NULL,
        "retiroCajaId"   INTEGER,
        liquidado        BOOLEAN NOT NULL DEFAULT false,
        "liquidacionId"  INTEGER,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_adelantos_lavador_fecha" ON cw_adelantos ("empresaId", "lavadorId", fecha)
    `);

    // ── cw_liquidaciones ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_liquidaciones (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        "lavadorId"         INTEGER NOT NULL,
        desde               DATE NOT NULL,
        hasta                DATE NOT NULL,
        "totalComisiones"   DECIMAL(10,2) NOT NULL,
        "totalAdelantos"    DECIMAL(10,2) NOT NULL,
        "totalPagado"       DECIMAL(10,2) NOT NULL,
        "retiroCajaId"      INTEGER,
        "usuarioId"         INTEGER NOT NULL,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_liquidaciones_lavador" ON cw_liquidaciones ("empresaId", "lavadorId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_liquidaciones`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_adelantos`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_comisiones`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_turno_lavadores`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_lavadores`);
    await queryRunner.query(`ALTER TABLE cw_servicio_precios DROP COLUMN IF EXISTS "tarifaLavador"`);
  }
}
