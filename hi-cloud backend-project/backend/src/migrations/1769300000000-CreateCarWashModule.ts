import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add-on Car Wash (lavadero de vehículos): config por sucursal, catálogo de
 * servicios con precio/duración por tipo de vehículo, turnos con ticket
 * público por token, y el contador atómico de número de turno (reinicia por
 * día RD y por sucursal — a diferencia de `siguiente_numero_secuencia()`,
 * que es monotónico para siempre y no sirve aquí).
 *
 * Sin FKs físicas a propósito, igual que el resto de add-ons de sector
 * (taller, gimnasio, óptica): el aislamiento multi-tenant lo garantiza el
 * código de aplicación (empresaId en cada fila), no una constraint de BD.
 */
export class CreateCarWashModule1769300000000 implements MigrationInterface {
  name = 'CreateCarWashModule1769300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // ── Parte 0: Registrar módulo ──────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('car_wash', 'Módulo Car Wash',
        'Gestión de lavadero de vehículos: turnos, tablero de estados, ticket con QR de seguimiento público y cobro vía POS')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. cw_config (una fila por sucursal) ───────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_config (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        "sucursalId"            INTEGER NOT NULL,
        "bahiasActivas"         INTEGER NOT NULL DEFAULT 1,
        "prefijoTurno"          VARCHAR(10) NOT NULL DEFAULT 'L',
        "usaSecado"             BOOLEAN NOT NULL DEFAULT false,
        "cobroEn"               VARCHAR(20) NOT NULL DEFAULT 'entrega',
        "horasCaducidadEnlace"  INTEGER NOT NULL DEFAULT 24,
        "createdAt"             TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"             TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "ck_cw_config_cobro_en" CHECK ("cobroEn" IN ('recepcion', 'entrega')),
        CONSTRAINT "uq_cw_config_empresa_sucursal" UNIQUE ("empresaId", "sucursalId")
      )
    `);

    // ── 2. cw_servicios ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_servicios (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER NOT NULL,
        nombre         VARCHAR(150) NOT NULL,
        "productoId"   INTEGER NOT NULL,
        activo         BOOLEAN NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_servicios_empresa" ON cw_servicios ("empresaId")
    `);

    // ── 3. cw_servicio_precios (precio + duración por tipo de vehículo) ───
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_servicio_precios (
        id                 SERIAL PRIMARY KEY,
        "servicioId"       INTEGER NOT NULL,
        "tipoVehiculo"     VARCHAR(20) NOT NULL,
        "duracionMinutos"  INTEGER NOT NULL,
        precio             DECIMAL(10,2) NOT NULL,
        CONSTRAINT "ck_cw_servicio_precio_tipo"
          CHECK ("tipoVehiculo" IN ('carro', 'jeepeta', 'camioneta', 'moto', 'camion')),
        CONSTRAINT "uq_cw_servicio_precio" UNIQUE ("servicioId", "tipoVehiculo")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_servicio_precios_servicio" ON cw_servicio_precios ("servicioId")
    `);

    // ── 4. cw_turnos ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_turnos (
        id                   SERIAL PRIMARY KEY,
        "empresaId"          INTEGER NOT NULL,
        "sucursalId"         INTEGER NOT NULL,
        "numeroDia"          INTEGER NOT NULL,
        codigo               VARCHAR(20) NOT NULL,
        "fechaRD"            DATE NOT NULL,
        placa                VARCHAR(20) NOT NULL,
        "tipoVehiculo"       VARCHAR(20) NOT NULL,
        marca                VARCHAR(100),
        color                VARCHAR(50),
        "clienteId"          INTEGER,
        telefono             VARCHAR(20),
        estado               VARCHAR(20) NOT NULL DEFAULT 'en_espera',
        bahia                INTEGER,
        "lavadorNombre"      VARCHAR(150),
        "tokenPublico"       VARCHAR(64) NOT NULL,
        "notasDanos"         TEXT,
        "motivoCancelacion"  TEXT,
        "enEsperaAt"         TIMESTAMP,
        "enLavadoAt"         TIMESTAMP,
        "secadoAt"           TIMESTAMP,
        "listoAt"            TIMESTAMP,
        "entregadoAt"        TIMESTAMP,
        "canceladoAt"        TIMESTAMP,
        "createdAt"          TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"          TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "ck_cw_turno_tipo_vehiculo"
          CHECK ("tipoVehiculo" IN ('carro', 'jeepeta', 'camioneta', 'moto', 'camion')),
        CONSTRAINT "ck_cw_turno_estado"
          CHECK (estado IN ('en_espera', 'en_lavado', 'secado', 'listo', 'entregado', 'cancelado')),
        CONSTRAINT "uq_cw_turno_codigo_dia" UNIQUE ("empresaId", "sucursalId", "fechaRD", "numeroDia"),
        CONSTRAINT "uq_cw_turno_token" UNIQUE ("tokenPublico")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_turnos_tablero" ON cw_turnos ("empresaId", "sucursalId", estado)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_turnos_fecha" ON cw_turnos ("empresaId", "sucursalId", "fechaRD")
    `);

    // ── 5. cw_turno_servicios (servicio/precio/duración congelados) ───────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_turno_servicios (
        id                 SERIAL PRIMARY KEY,
        "turnoId"          INTEGER NOT NULL,
        "servicioId"       INTEGER NOT NULL,
        nombre             VARCHAR(150) NOT NULL,
        precio             DECIMAL(10,2) NOT NULL,
        "duracionMinutos"  INTEGER NOT NULL,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_turno_servicios_turno" ON cw_turno_servicios ("turnoId")
    `);

    // ── 6. cw_turno_fotos (reutiliza el filtro MIME de soporte_ticket_adjuntos) ─
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_turno_fotos (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "turnoId"       INTEGER NOT NULL,
        ruta            TEXT NOT NULL,
        "tipoMime"      VARCHAR(50) NOT NULL,
        "tamanioBytes"  INTEGER NOT NULL,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_turno_fotos_turno" ON cw_turno_fotos ("turnoId")
    `);

    // ── 7. cw_turno_eventos (historial de transiciones, con autoría) ──────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_turno_eventos (
        id                 SERIAL PRIMARY KEY,
        "turnoId"          INTEGER NOT NULL,
        "empresaId"        INTEGER NOT NULL,
        "estadoAnterior"   VARCHAR(20),
        "estadoNuevo"      VARCHAR(20) NOT NULL,
        "usuarioId"        INTEGER,
        motivo             TEXT,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cw_turno_eventos_turno" ON cw_turno_eventos ("turnoId")
    `);

    // ── 8. cw_contador_turno (reinicia por día RD y por sucursal) ──────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cw_contador_turno (
        "empresaId"   INTEGER NOT NULL,
        "sucursalId"  INTEGER NOT NULL,
        "fechaRD"     DATE NOT NULL,
        ultimo        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY ("empresaId", "sucursalId", "fechaRD")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_contador_turno`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_turno_eventos`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_turno_fotos`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_turno_servicios`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_turnos`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_servicio_precios`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_servicios`);
    await queryRunner.query(`DROP TABLE IF EXISTS cw_config`);
    await queryRunner.query(`DELETE FROM modulos_addon WHERE codigo = 'car_wash'`);
  }
}
