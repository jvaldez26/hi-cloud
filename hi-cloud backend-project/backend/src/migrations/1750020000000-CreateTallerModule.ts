import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTallerModule1750020000000 implements MigrationInterface {
  name = 'CreateTallerModule1750020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Parte 0: Registrar módulo ────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('taller', 'Módulo Taller Mecánico',
        'Gestión completa para talleres: vehículos, órdenes de servicio, diagnóstico, repuestos, mano de obra y facturación')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. tm_vehiculos ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_vehiculos (
        id                          SERIAL PRIMARY KEY,
        "empresaId"                 INTEGER NOT NULL,
        placa                       VARCHAR(20) NOT NULL,
        vin                         VARCHAR(50),
        marca                       VARCHAR(100) NOT NULL,
        modelo                      VARCHAR(100) NOT NULL,
        anio                        INTEGER,
        color                       VARCHAR(50),
        tipo                        VARCHAR(50),
        combustible                 VARCHAR(30),
        transmision                 VARCHAR(20),
        cilindraje                  VARCHAR(20),
        "kilometrajeActual"         INTEGER DEFAULT 0,
        "kilometrajeUltimoServicio" INTEGER,
        "proximoServicioKm"         INTEGER,
        "clienteId"                 INTEGER,
        "propietarioNombre"         VARCHAR(200),
        "propietarioTelefono"       VARCHAR(20),
        "propietarioEmail"          VARCHAR(100),
        observaciones               TEXT,
        "imagenUrl"                 TEXT,
        "isActive"                  BOOLEAN NOT NULL DEFAULT true,
        "createdAt"                 TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"                 TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tm_vehiculos_placa') THEN
          ALTER TABLE tm_vehiculos ADD CONSTRAINT uq_tm_vehiculos_placa UNIQUE ("empresaId", placa);
        END IF;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_vehiculos_empresa ON tm_vehiculos ("empresaId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_vehiculos_placa  ON tm_vehiculos ("empresaId", placa)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_vehiculos_cliente ON tm_vehiculos ("empresaId", "clienteId")`);

    // ── 2. tm_tecnicos ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_tecnicos (
        id            SERIAL PRIMARY KEY,
        "empresaId"   INTEGER NOT NULL,
        nombre        VARCHAR(200) NOT NULL,
        especialidad  VARCHAR(100),
        telefono      VARCHAR(20),
        email         VARCHAR(100),
        "tarifaHora"  DECIMAL(10,2),
        "empleadoId"  INTEGER,
        "isActive"    BOOLEAN NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_tecnicos_empresa ON tm_tecnicos ("empresaId")`);

    // ── 3. tm_ordenes ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_ordenes (
        id                       SERIAL PRIMARY KEY,
        "empresaId"              INTEGER NOT NULL,
        numero                   VARCHAR(20) NOT NULL,
        "vehiculoId"             INTEGER NOT NULL,
        "clienteId"              INTEGER,
        "fechaIngreso"           TIMESTAMP NOT NULL DEFAULT NOW(),
        "kilometrajeIngreso"     INTEGER,
        "nivelCombustible"       VARCHAR(20),
        "motivoIngreso"          TEXT NOT NULL,
        "diagnosticoInicial"     TEXT,
        "tecnicoId"              INTEGER,
        prioridad                VARCHAR(20) NOT NULL DEFAULT 'normal',
        estado                   VARCHAR(30) NOT NULL DEFAULT 'recibido',
        "fechaDiagnostico"       TIMESTAMP,
        "fechaAprobacion"        TIMESTAMP,
        "fechaInicio"            TIMESTAMP,
        "fechaEstimadaEntrega"   DATE,
        "fechaFinalizacion"      TIMESTAMP,
        "fechaEntrega"           TIMESTAMP,
        "presupuestoAprobado"    BOOLEAN NOT NULL DEFAULT false,
        "aprobadoPor"            VARCHAR(100),
        "aprobadoFecha"          TIMESTAMP,
        "formaAprobacion"        VARCHAR(50),
        "tieneRayones"           BOOLEAN NOT NULL DEFAULT false,
        "tieneGolpes"            BOOLEAN NOT NULL DEFAULT false,
        "tieneDocumentos"        BOOLEAN NOT NULL DEFAULT false,
        "tieneGato"              BOOLEAN NOT NULL DEFAULT false,
        "tieneHerramientas"      BOOLEAN NOT NULL DEFAULT false,
        "observacionesIngreso"   TEXT,
        "subtotalManoObra"       DECIMAL(12,2) NOT NULL DEFAULT 0,
        "subtotalRepuestos"      DECIMAL(12,2) NOT NULL DEFAULT 0,
        descuento                DECIMAL(12,2) NOT NULL DEFAULT 0,
        itbis                    DECIMAL(12,2) NOT NULL DEFAULT 0,
        total                    DECIMAL(12,2) NOT NULL DEFAULT 0,
        "garantiaDias"           INTEGER NOT NULL DEFAULT 0,
        "garantiaKm"             INTEGER NOT NULL DEFAULT 0,
        "facturaId"              INTEGER,
        notas                    TEXT,
        "createdBy"              INTEGER,
        "createdAt"              TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"              TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tm_ordenes_numero') THEN
          ALTER TABLE tm_ordenes ADD CONSTRAINT uq_tm_ordenes_numero UNIQUE ("empresaId", numero);
        END IF;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_ordenes_empresa  ON tm_ordenes ("empresaId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_ordenes_estado   ON tm_ordenes ("empresaId", estado)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_ordenes_fecha    ON tm_ordenes ("empresaId", "fechaIngreso" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_ordenes_vehiculo ON tm_ordenes ("empresaId", "vehiculoId")`);

    // ── 4. tm_orden_servicios ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_orden_servicios (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        "ordenId"         INTEGER NOT NULL,
        "tecnicoId"       INTEGER,
        descripcion       TEXT NOT NULL,
        categoria         VARCHAR(100),
        "horasEstimadas"  DECIMAL(5,2),
        "horasReales"     DECIMAL(5,2),
        "tarifaHora"      DECIMAL(10,2),
        "precioUnitario"  DECIMAL(10,2) NOT NULL DEFAULT 0,
        cantidad          DECIMAL(8,2) NOT NULL DEFAULT 1,
        descuento         DECIMAL(10,2) NOT NULL DEFAULT 0,
        total             DECIMAL(12,2) NOT NULL DEFAULT 0,
        estado            VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        "completadoAt"    TIMESTAMP,
        notas             TEXT,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_orden_servicios_orden ON tm_orden_servicios ("ordenId")`);

    // ── 5. tm_orden_repuestos ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_orden_repuestos (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        "ordenId"         INTEGER NOT NULL,
        "productoId"      INTEGER,
        descripcion       TEXT NOT NULL,
        referencia        VARCHAR(100),
        marca             VARCHAR(100),
        cantidad          DECIMAL(8,2) NOT NULL DEFAULT 1,
        "costoUnitario"   DECIMAL(10,2),
        "precioUnitario"  DECIMAL(10,2) NOT NULL DEFAULT 0,
        descuento         DECIMAL(10,2) NOT NULL DEFAULT 0,
        total             DECIMAL(12,2) NOT NULL DEFAULT 0,
        origen            VARCHAR(30) NOT NULL DEFAULT 'inventario',
        notas             TEXT,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_orden_repuestos_orden ON tm_orden_repuestos ("ordenId")`);

    // ── 6. tm_diagnosticos ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_diagnosticos (
        id                          SERIAL PRIMARY KEY,
        "empresaId"                 INTEGER NOT NULL,
        "ordenId"                   INTEGER NOT NULL,
        "tecnicoId"                 INTEGER,
        fecha                       TIMESTAMP NOT NULL DEFAULT NOW(),
        sistema                     VARCHAR(100),
        descripcion                 TEXT NOT NULL,
        severidad                   VARCHAR(20),
        recomendacion               TEXT,
        "requiereAtencionInmediata" BOOLEAN NOT NULL DEFAULT false,
        "incluidoEnPresupuesto"     BOOLEAN NOT NULL DEFAULT true,
        "costoEstimado"             DECIMAL(10,2),
        "imagenUrl"                 TEXT,
        "createdAt"                 TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_diagnosticos_orden ON tm_diagnosticos ("ordenId")`);

    // ── 7. tm_historial_mantenimiento ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_historial_mantenimiento (
        id                           SERIAL PRIMARY KEY,
        "empresaId"                  INTEGER NOT NULL,
        "vehiculoId"                 INTEGER NOT NULL,
        "ordenId"                    INTEGER,
        fecha                        DATE NOT NULL,
        tipo                         VARCHAR(100),
        descripcion                  TEXT,
        kilometraje                  INTEGER,
        "proximoMantenimientoKm"     INTEGER,
        "proximoMantenimientoFecha"  DATE,
        costo                        DECIMAL(10,2),
        "createdAt"                  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_historial_vehiculo ON tm_historial_mantenimiento ("vehiculoId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_historial_empresa  ON tm_historial_mantenimiento ("empresaId", "vehiculoId")`);

    // ── 8. tm_checklist ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_checklist (
        id                           SERIAL PRIMARY KEY,
        "empresaId"                  INTEGER NOT NULL,
        "ordenId"                    INTEGER NOT NULL UNIQUE,
        "motorAceite"                VARCHAR(20),
        "motorRefrigerante"          VARCHAR(20),
        "motorCorreas"               VARCHAR(20),
        "motorFiltroAire"            VARCHAR(20),
        "motorBujias"                VARCHAR(20),
        "frenosPastillas"            VARCHAR(20),
        "frenosDiscos"               VARCHAR(20),
        "frenosLiquido"              VARCHAR(20),
        "frenosMano"                 VARCHAR(20),
        "suspensionAmortiguadores"   VARCHAR(20),
        "suspensionBrazos"           VARCHAR(20),
        "suspensionBujes"            VARCHAR(20),
        "llantaDelanteraIzq"         VARCHAR(20),
        "llantaDelanteraDer"         VARCHAR(20),
        "llantaTraseraIzq"           VARCHAR(20),
        "llantaTraseraDer"           VARCHAR(20),
        "llantaRepuesto"             VARCHAR(20),
        "electricoBateria"           VARCHAR(20),
        "electricoAlternador"        VARCHAR(20),
        "electricoLuces"             VARCHAR(20),
        "acFuncionamiento"           VARCHAR(20),
        "acGas"                      VARCHAR(20),
        "acFiltro"                   VARCHAR(20),
        limpiaparabrisas             VARCHAR(20),
        "nivelLiquidos"              VARCHAR(20),
        observaciones                TEXT,
        "inspeccionadoPor"           INTEGER,
        "fechaInspeccion"            TIMESTAMP NOT NULL DEFAULT NOW(),
        "createdAt"                  TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"                  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // ── 9. tm_citas ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_citas (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        numero              VARCHAR(20),
        "vehiculoId"        INTEGER,
        "clienteId"         INTEGER,
        "tecnicoId"         INTEGER,
        fecha               DATE NOT NULL,
        hora                TIME NOT NULL,
        "duracionMinutos"   INTEGER NOT NULL DEFAULT 60,
        "tipoServicio"      VARCHAR(100),
        descripcion         TEXT,
        estado              VARCHAR(20) NOT NULL DEFAULT 'programada',
        "recordatorioEnviado" BOOLEAN NOT NULL DEFAULT false,
        notas               TEXT,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_citas_empresa ON tm_citas ("empresaId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_citas_fecha   ON tm_citas ("empresaId", fecha)`);

    // ── 10. tm_catalogo_servicios ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tm_catalogo_servicios (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        nombre            VARCHAR(200) NOT NULL,
        descripcion       TEXT,
        categoria         VARCHAR(100),
        "precioBase"      DECIMAL(10,2),
        "horasEstimadas"  DECIMAL(5,2),
        "isActive"        BOOLEAN NOT NULL DEFAULT true,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tm_catalogo_empresa ON tm_catalogo_servicios ("empresaId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tm_catalogo_servicios`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_citas`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_checklist`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_historial_mantenimiento`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_diagnosticos`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_orden_repuestos`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_orden_servicios`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_ordenes`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_tecnicos`);
    await queryRunner.query(`DROP TABLE IF EXISTS tm_vehiculos`);
    await queryRunner.query(`DELETE FROM modulos_addon WHERE codigo = 'taller'`);
  }
}
