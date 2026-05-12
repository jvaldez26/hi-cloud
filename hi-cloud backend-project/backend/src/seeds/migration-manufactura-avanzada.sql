-- =============================================================================
-- Migración: Manufactura Avanzada
-- Fecha: 2026-05-09
-- Descripción:
--   1. centros_trabajo — máquinas y áreas de producción
--   2. rutas_produccion — secuencia de operaciones por producto
--   3. etapas_ruta — pasos de cada ruta con tiempos
--   4. registro_etapas_orden — WIP: progreso de cada orden por etapa
-- =============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE centros_trabajo_tipo_enum AS ENUM ('maquina', 'manual', 'subcontratado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE registro_etapas_estado_enum AS ENUM ('pendiente','en_proceso','completada','omitida','rechazada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS centros_trabajo (
  id                    SERIAL PRIMARY KEY,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"           INTEGER,
  nombre                VARCHAR(100) NOT NULL,
  descripcion           VARCHAR(200),
  tipo                  centros_trabajo_tipo_enum NOT NULL DEFAULT 'manual',
  "capacidadHorasDia"   DECIMAL(8,2) NOT NULL DEFAULT 8,
  "costoHora"           DECIMAL(10,2) NOT NULL DEFAULT 0,
  responsable           VARCHAR(100),
  ubicacion             VARCHAR(200),
  activo                BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_centros_trabajo_empresa
  ON centros_trabajo ("empresaId");

CREATE TABLE IF NOT EXISTS rutas_produccion (
  id            SERIAL PRIMARY KEY,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"   INTEGER,
  codigo        VARCHAR(20) NOT NULL,
  nombre        VARCHAR(200) NOT NULL,
  descripcion   TEXT,
  "listaId"     INTEGER,
  activa        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_rutas_produccion_empresa
  ON rutas_produccion ("empresaId");

CREATE TABLE IF NOT EXISTS etapas_ruta (
  id                               SERIAL PRIMARY KEY,
  "isActive"                       BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"                      INTEGER,
  "rutaId"                         INTEGER NOT NULL REFERENCES rutas_produccion(id) ON DELETE CASCADE,
  "centroTrabajoId"                INTEGER REFERENCES centros_trabajo(id),
  orden                            INTEGER NOT NULL DEFAULT 1,
  nombre                           VARCHAR(200) NOT NULL,
  descripcion                      TEXT,
  "tiempoSetupMin"                 DECIMAL(8,2) NOT NULL DEFAULT 0,
  "tiempoOperacionMinPorUnidad"    DECIMAL(8,2) NOT NULL DEFAULT 0,
  "esControl"                      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_etapas_ruta_ruta
  ON etapas_ruta ("rutaId");

CREATE TABLE IF NOT EXISTS registro_etapas_orden (
  id                  SERIAL PRIMARY KEY,
  "isActive"          BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"         INTEGER,
  "ordenId"           INTEGER NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  "etapaId"           INTEGER NOT NULL REFERENCES etapas_ruta(id),
  "ordenEtapa"        INTEGER NOT NULL DEFAULT 1,
  estado              registro_etapas_estado_enum NOT NULL DEFAULT 'pendiente',
  "fechaInicio"       TIMESTAMPTZ,
  "fechaFin"          TIMESTAMPTZ,
  "cantidadProcesada" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "operadorId"        INTEGER,
  observaciones       TEXT
);

CREATE INDEX IF NOT EXISTS idx_registro_etapas_orden_orden
  ON registro_etapas_orden ("ordenId");
CREATE INDEX IF NOT EXISTS idx_registro_etapas_orden_estado
  ON registro_etapas_orden ("ordenId", estado);

COMMIT;
