-- =============================================================================
-- Migración: Nómina Avanzada
-- Fecha: 2026-05-09
-- Descripción:
--   1. Nuevos ENUMs: tipo_novedad_enum, estado_contrato_enum
--   2. Nueva tabla nomina_novedades (novedades excepcionales por empleado)
--   3. Nueva tabla contratos_laborales (contratos de trabajo formales)
--   4. Nuevas columnas en nomina_lineas (horas extras, bonos, descuentos variables)
-- IMPORTANTE: TypeORM sin NamingStrategy → columnas en camelCase
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE nomina_novedades_tipo_enum AS ENUM (
    'bono', 'horas_extras', 'ausencia', 'descuento', 'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contratos_laborales_tipo_enum AS ENUM (
    'indefinido', 'fijo', 'temporal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contratos_laborales_estado_enum AS ENUM (
    'activo', 'vencido', 'rescindido'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA nomina_novedades
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nomina_novedades (
  id            SERIAL PRIMARY KEY,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"   INTEGER,

  "empleadoId"  INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  "periodoId"   INTEGER,

  tipo          nomina_novedades_tipo_enum NOT NULL,
  descripcion   VARCHAR(200) NOT NULL,
  monto         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "horasExtras" INTEGER NOT NULL DEFAULT 0,
  aplicado      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_nomina_novedades_empresa
  ON nomina_novedades ("empresaId");

CREATE INDEX IF NOT EXISTS idx_nomina_novedades_empleado
  ON nomina_novedades ("empleadoId");

CREATE INDEX IF NOT EXISTS idx_nomina_novedades_periodo
  ON nomina_novedades ("periodoId")
  WHERE "periodoId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLA contratos_laborales
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contratos_laborales (
  id              SERIAL PRIMARY KEY,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"     INTEGER,

  "empleadoId"    INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  numero          VARCHAR(50) NOT NULL,
  tipo            contratos_laborales_tipo_enum NOT NULL DEFAULT 'indefinido',
  estado          contratos_laborales_estado_enum NOT NULL DEFAULT 'activo',

  "fechaInicio"   DATE NOT NULL,
  "fechaFin"      DATE,
  salario         DECIMAL(12,2) NOT NULL,
  cargo           VARCHAR(100) NOT NULL,
  departamento    VARCHAR(100),
  clausulas       TEXT,
  "lugarTrabajo"  VARCHAR(100),
  "horasSemana"   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_contratos_laborales_empresa
  ON contratos_laborales ("empresaId");

CREATE INDEX IF NOT EXISTS idx_contratos_laborales_empleado
  ON contratos_laborales ("empleadoId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. NUEVAS COLUMNAS EN nomina_lineas
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nomina_lineas
  ADD COLUMN IF NOT EXISTS "horasExtras"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "montoHorasExtras" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonos              DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "otrosDescuentos"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "novedadesDetalle" TEXT;

COMMIT;
