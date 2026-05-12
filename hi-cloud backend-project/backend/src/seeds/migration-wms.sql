-- =============================================================================
-- Migración: WMS — Warehouse Management System
-- Fecha: 2026-05-09
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMs
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE wms_ubicacion_tipo_enum AS ENUM (
    'picking', 'bulk', 'recepcion', 'despacho', 'cuarentena'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wms_orden_tipo_enum AS ENUM (
    'salida_venta', 'transferencia', 'devolucion', 'ajuste'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wms_orden_estado_enum AS ENUM (
    'borrador', 'asignada', 'en_proceso', 'empacada', 'despachada', 'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wms_linea_estado_enum AS ENUM (
    'pendiente', 'pickeado', 'faltante', 'parcial'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wms_ubicaciones
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wms_ubicaciones (
  id              SERIAL PRIMARY KEY,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"     INTEGER,
  "almacenId"     INTEGER NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  codigo          VARCHAR(30) NOT NULL,
  pasillo         VARCHAR(10),
  estante         VARCHAR(10),
  nivel           VARCHAR(10),
  posicion        VARCHAR(10),
  tipo            wms_ubicacion_tipo_enum NOT NULL DEFAULT 'picking',
  "capacidadKg"   DECIMAL(8,2),
  activa          BOOLEAN NOT NULL DEFAULT TRUE,
  notas           TEXT
);

CREATE INDEX IF NOT EXISTS idx_wms_ubicaciones_empresa
  ON wms_ubicaciones ("empresaId", "almacenId");
CREATE INDEX IF NOT EXISTS idx_wms_ubicaciones_codigo
  ON wms_ubicaciones ("empresaId", codigo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wms_ordenes_picking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wms_ordenes_picking (
  id                SERIAL PRIMARY KEY,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"       INTEGER,
  numero            VARCHAR(20) NOT NULL,
  tipo              wms_orden_tipo_enum NOT NULL DEFAULT 'salida_venta',
  estado            wms_orden_estado_enum NOT NULL DEFAULT 'borrador',
  "almacenId"       INTEGER NOT NULL REFERENCES almacenes(id),
  "facturaId"       INTEGER,
  "transferId"      INTEGER,
  "operadorId"      INTEGER,
  "creadoPorId"     INTEGER,
  "fechaAsignacion" TIMESTAMPTZ,
  "fechaInicio"     TIMESTAMPTZ,
  "fechaEmpacado"   TIMESTAMPTZ,
  "fechaDespachado" TIMESTAMPTZ,
  prioridad         INTEGER NOT NULL DEFAULT 2,
  observaciones     TEXT,
  destinatario      VARCHAR(100),
  "direccionEntrega" VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_wms_ordenes_estado
  ON wms_ordenes_picking ("empresaId", estado);
CREATE INDEX IF NOT EXISTS idx_wms_ordenes_operador
  ON wms_ordenes_picking ("empresaId", "operadorId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wms_lineas_picking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wms_lineas_picking (
  id                   SERIAL PRIMARY KEY,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"          INTEGER,
  "ordenId"            INTEGER NOT NULL REFERENCES wms_ordenes_picking(id) ON DELETE CASCADE,
  "productoId"         INTEGER NOT NULL REFERENCES productos(id),
  "ubicacionId"        INTEGER,
  "ubicacionCodigo"    VARCHAR(30),
  "cantidadSolicitada" DECIMAL(12,4) NOT NULL,
  "cantidadPickeada"   DECIMAL(12,4) NOT NULL DEFAULT 0,
  estado               wms_linea_estado_enum NOT NULL DEFAULT 'pendiente',
  "loteId"             INTEGER,
  "numeroSerie"        VARCHAR(100),
  notas                TEXT,
  "orden_linea"        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wms_lineas_orden
  ON wms_lineas_picking ("ordenId");

COMMIT;
