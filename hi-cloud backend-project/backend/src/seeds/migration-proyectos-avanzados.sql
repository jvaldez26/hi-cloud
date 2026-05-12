-- =============================================================================
-- Migración: Proyectos Avanzados — Gantt, Presupuesto, Hitos
-- Fecha: 2026-05-09
-- =============================================================================

BEGIN;

-- ── 1. Nuevas columnas en proyecto_tareas ─────────────────────────────────────
ALTER TABLE proyecto_tareas
  ADD COLUMN IF NOT EXISTS "fechaInicio"  DATE,
  ADD COLUMN IF NOT EXISTS "horasReales" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "esHito"      BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. presupuesto_proyecto_lineas ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE presupuesto_categoria_enum AS ENUM (
    'mano_obra', 'materiales', 'subcontratista', 'gastos_viaje', 'licencias', 'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS presupuesto_proyecto_lineas (
  id              SERIAL PRIMARY KEY,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"     INTEGER,
  "proyectoId"    INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  categoria       presupuesto_categoria_enum NOT NULL DEFAULT 'otro',
  descripcion     VARCHAR(200) NOT NULL,
  monto           DECIMAL(14,2) NOT NULL DEFAULT 0,
  "montoReal"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  notas           TEXT
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_proy_proyecto
  ON presupuesto_proyecto_lineas ("proyectoId");

-- ── 3. hitos_proyecto ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hitos_proyecto (
  id                SERIAL PRIMARY KEY,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"       INTEGER,
  "proyectoId"      INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre            VARCHAR(200) NOT NULL,
  fecha             DATE NOT NULL,
  descripcion       TEXT,
  completado        BOOLEAN NOT NULL DEFAULT FALSE,
  "fechaCompletado" DATE
);

CREATE INDEX IF NOT EXISTS idx_hitos_proyecto_proyecto
  ON hitos_proyecto ("proyectoId");
CREATE INDEX IF NOT EXISTS idx_hitos_proyecto_fecha
  ON hitos_proyecto ("proyectoId", fecha);

COMMIT;
