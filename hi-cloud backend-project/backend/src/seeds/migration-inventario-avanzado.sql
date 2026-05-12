-- =============================================================================
-- Migración: Inventarios Avanzados — Lotes y Seriales
-- Fecha: 2026-05-09
-- Descripción:
--   1. Nueva tabla lotes_producto (batches con fecha de vencimiento)
--   2. Nueva tabla seriales_producto (números de serie por unidad)
-- IMPORTANTE: TypeORM sin NamingStrategy → columnas en camelCase
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMs
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE lotes_producto_estado_enum AS ENUM (
    'activo', 'agotado', 'vencido', 'cuarentena'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE seriales_producto_estado_enum AS ENUM (
    'disponible', 'vendido', 'devuelto', 'defectuoso', 'en_garantia', 'dado_baja'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA lotes_producto
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lotes_producto (
  id                   SERIAL PRIMARY KEY,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"          INTEGER,

  "productoId"         INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  "almacenId"          INTEGER,

  "numeroLote"         VARCHAR(100) NOT NULL,
  "fechaFabricacion"   DATE,
  "fechaVencimiento"   DATE,

  "cantidadInicial"    DECIMAL(12,4) NOT NULL,
  "cantidadDisponible" DECIMAL(12,4) NOT NULL,
  "costoUnitario"      DECIMAL(12,2) NOT NULL DEFAULT 0,

  estado               lotes_producto_estado_enum NOT NULL DEFAULT 'activo',

  proveedor            VARCHAR(200),
  referencia           VARCHAR(100),
  notas                TEXT
);

CREATE INDEX IF NOT EXISTS idx_lotes_producto_empresa
  ON lotes_producto ("empresaId");

CREATE INDEX IF NOT EXISTS idx_lotes_producto_producto
  ON lotes_producto ("productoId");

CREATE INDEX IF NOT EXISTS idx_lotes_producto_vencimiento
  ON lotes_producto ("fechaVencimiento")
  WHERE "fechaVencimiento" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLA seriales_producto
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seriales_producto (
  id                         SERIAL PRIMARY KEY,
  "isActive"                 BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"                INTEGER,

  "productoId"               INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  "numeroSerie"              VARCHAR(100) NOT NULL,

  estado                     seriales_producto_estado_enum NOT NULL DEFAULT 'disponible',

  "loteId"                   INTEGER,
  "facturaId"                INTEGER,
  "clienteId"                INTEGER,

  "fechaVenta"               DATE,
  "fechaVencimientoGarantia" DATE,
  "costoUnitario"            DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas                      TEXT
);

CREATE INDEX IF NOT EXISTS idx_seriales_producto_empresa
  ON seriales_producto ("empresaId");

CREATE INDEX IF NOT EXISTS idx_seriales_producto_producto
  ON seriales_producto ("productoId");

CREATE INDEX IF NOT EXISTS idx_seriales_producto_numero
  ON seriales_producto ("empresaId", "numeroSerie");

COMMIT;
