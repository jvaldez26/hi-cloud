-- =============================================================================
-- Migración: Compras Avanzadas
-- Fecha: 2026-05-09
-- Descripción:
--   1. solicitudes_compra — solicitudes de compra internas
--   2. solicitud_compra_lineas — ítems por solicitud
--   3. cotizaciones_proveedor — RFQ enviadas a proveedores
--   4. cotizacion_proveedor_lineas — líneas con precios de cada proveedor
-- IMPORTANTE: columnas en camelCase (TypeORM sin NamingStrategy)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMs
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE solicitud_compra_estado_enum AS ENUM (
    'borrador', 'enviada', 'aprobada', 'rechazada',
    'en_cotizacion', 'procesada', 'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE solicitud_compra_prioridad_enum AS ENUM (
    'baja', 'media', 'alta', 'urgente'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cotizacion_proveedor_estado_enum AS ENUM (
    'borrador', 'enviada', 'recibida', 'seleccionada', 'rechazada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. solicitudes_compra
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solicitudes_compra (
  id                      SERIAL PRIMARY KEY,
  "isActive"              BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"             INTEGER,

  numero                  VARCHAR(20) NOT NULL,
  "solicitanteId"         INTEGER NOT NULL REFERENCES users(id),
  "fechaSolicitud"        DATE NOT NULL,
  "fechaNecesidad"        DATE,

  estado                  solicitud_compra_estado_enum NOT NULL DEFAULT 'borrador',
  prioridad               solicitud_compra_prioridad_enum NOT NULL DEFAULT 'media',
  departamento            VARCHAR(200),
  justificacion           TEXT NOT NULL,
  "presupuestoEstimado"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "comentarioAprobacion"  TEXT,
  "aprobadorId"           INTEGER,
  "fechaAprobacion"       DATE
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_compra_empresa
  ON solicitudes_compra ("empresaId");
CREATE INDEX IF NOT EXISTS idx_solicitudes_compra_estado
  ON solicitudes_compra ("empresaId", estado);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. solicitud_compra_lineas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solicitud_compra_lineas (
  id                   SERIAL PRIMARY KEY,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"          INTEGER,

  "solicitudId"        INTEGER NOT NULL REFERENCES solicitudes_compra(id) ON DELETE CASCADE,
  "productoId"         INTEGER,
  descripcion          VARCHAR(300) NOT NULL,
  unidad               VARCHAR(30) NOT NULL DEFAULT 'UND',
  cantidad             DECIMAL(12,4) NOT NULL,
  "presupuestoUnitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
  especificaciones     TEXT
);

CREATE INDEX IF NOT EXISTS idx_sol_compra_lineas_solicitud
  ON solicitud_compra_lineas ("solicitudId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cotizaciones_proveedor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cotizaciones_proveedor (
  id                   SERIAL PRIMARY KEY,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"          INTEGER,

  numero               VARCHAR(20) NOT NULL,
  "solicitudId"        INTEGER REFERENCES solicitudes_compra(id),
  "proveedorId"        INTEGER NOT NULL REFERENCES proveedores(id),

  "fechaEnvio"         DATE NOT NULL,
  "fechaRespuesta"     DATE,
  "fechaValidez"       DATE,
  "tiempoEntregaDias"  INTEGER NOT NULL DEFAULT 0,
  "condicionesPago"    VARCHAR(200),

  estado               cotizacion_proveedor_estado_enum NOT NULL DEFAULT 'enviada',

  subtotal             DECIMAL(14,2) NOT NULL DEFAULT 0,
  itbis                DECIMAL(12,2) NOT NULL DEFAULT 0,
  total                DECIMAL(14,2) NOT NULL DEFAULT 0,
  notas                TEXT
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_proveedor_empresa
  ON cotizaciones_proveedor ("empresaId");
CREATE INDEX IF NOT EXISTS idx_cotizaciones_proveedor_solicitud
  ON cotizaciones_proveedor ("solicitudId")
  WHERE "solicitudId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. cotizacion_proveedor_lineas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cotizacion_proveedor_lineas (
  id                SERIAL PRIMARY KEY,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"       INTEGER,

  "cotizacionId"    INTEGER NOT NULL REFERENCES cotizaciones_proveedor(id) ON DELETE CASCADE,
  "productoId"      INTEGER,
  descripcion       VARCHAR(300) NOT NULL,
  cantidad          DECIMAL(12,4) NOT NULL,
  "precioUnitario"  DECIMAL(12,2) NOT NULL,
  "porcentajeItbis" DECIMAL(5,2) NOT NULL DEFAULT 18,
  itbis             DECIMAL(12,2) NOT NULL DEFAULT 0,
  total             DECIMAL(12,2) NOT NULL,
  unidad            VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_cot_prov_lineas_cotizacion
  ON cotizacion_proveedor_lineas ("cotizacionId");

COMMIT;
