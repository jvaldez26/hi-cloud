-- =============================================================================
-- Migración: Planeación de la Demanda
-- Fecha: 2026-05-09
-- =============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE plan_demanda_estado_enum AS ENUM ('borrador', 'aprobado', 'ejecutado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE plan_demanda_tendencia_enum AS ENUM ('creciente', 'estable', 'decreciente', 'sin_datos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS planes_demanda (
  id                    SERIAL PRIMARY KEY,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"           INTEGER,
  numero                VARCHAR(20) NOT NULL,
  "periodoDesde"        VARCHAR(7) NOT NULL,
  "periodoHasta"        VARCHAR(7) NOT NULL,
  "horizonteMeses"      INTEGER NOT NULL DEFAULT 3,
  estado                plan_demanda_estado_enum NOT NULL DEFAULT 'borrador',
  "totalProductos"      INTEGER NOT NULL DEFAULT 0,
  "productosConAlerta"  INTEGER NOT NULL DEFAULT 0,
  notas                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_planes_demanda_empresa
  ON planes_demanda ("empresaId");

CREATE TABLE IF NOT EXISTS plan_demanda_lineas (
  id                        SERIAL PRIMARY KEY,
  "isActive"                BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"               INTEGER,
  "planId"                  INTEGER NOT NULL REFERENCES planes_demanda(id) ON DELETE CASCADE,
  "productoId"              INTEGER NOT NULL REFERENCES productos(id),
  "ventaPromedio3m"         DECIMAL(12,4) NOT NULL DEFAULT 0,
  "ventaPromedio6m"         DECIMAL(12,4) NOT NULL DEFAULT 0,
  "ventaPromedio12m"        DECIMAL(12,4) NOT NULL DEFAULT 0,
  "ventaMaximaMensual"      DECIMAL(12,4) NOT NULL DEFAULT 0,
  "ventaMinimaMensual"      DECIMAL(12,4) NOT NULL DEFAULT 0,
  tendencia                 plan_demanda_tendencia_enum NOT NULL DEFAULT 'sin_datos',
  "coeficienteVariacion"    DECIMAL(6,2) NOT NULL DEFAULT 0,
  "proyeccionMes1"          DECIMAL(12,4) NOT NULL DEFAULT 0,
  "proyeccionMes2"          DECIMAL(12,4) NOT NULL DEFAULT 0,
  "proyeccionMes3"          DECIMAL(12,4) NOT NULL DEFAULT 0,
  "proyeccionTotal"         DECIMAL(12,4) NOT NULL DEFAULT 0,
  "stockActual"             DECIMAL(12,4) NOT NULL DEFAULT 0,
  "stockMinimo"             DECIMAL(12,4) NOT NULL DEFAULT 0,
  "cantidadSugeridaCompra"  DECIMAL(12,4) NOT NULL DEFAULT 0,
  "requiereCompra"          BOOLEAN NOT NULL DEFAULT FALSE,
  "historicoMensual"        TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_demanda_lineas_plan
  ON plan_demanda_lineas ("planId");
CREATE INDEX IF NOT EXISTS idx_plan_demanda_lineas_alerta
  ON plan_demanda_lineas ("planId", "requiereCompra")
  WHERE "requiereCompra" = TRUE;

COMMIT;
