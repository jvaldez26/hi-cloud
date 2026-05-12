-- =============================================================================
-- Migración: Finanzas Avanzadas + Servicios Avanzados + Comisiones Avanzadas
-- Fecha: 2026-05-09
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COMISIONES AVANZADAS — reglas_comision
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE reglas_comision_tipo_enum AS ENUM (
    'global', 'por_vendedor', 'por_categoria', 'por_monto', 'por_antiguedad'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS reglas_comision (
  id                SERIAL PRIMARY KEY,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"       INTEGER,
  nombre            VARCHAR(100) NOT NULL,
  tipo              reglas_comision_tipo_enum NOT NULL DEFAULT 'global',
  prioridad         INTEGER NOT NULL DEFAULT 100,
  "vendedorId"      INTEGER,
  categoria         VARCHAR(100),
  "montoDesde"      DECIMAL(14,2),
  "montoHasta"      DECIMAL(14,2),
  "diasMaximoCobro" INTEGER,
  porcentaje        DECIMAL(5,2) NOT NULL,
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  descripcion       TEXT
);

CREATE INDEX IF NOT EXISTS idx_reglas_comision_empresa
  ON reglas_comision ("empresaId", prioridad);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SERVICIOS AVANZADOS — nuevas columnas en ordenes_servicio
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ordenes_servicio_prioridad_enum AS ENUM ('baja','normal','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ordenes_servicio
  ADD COLUMN IF NOT EXISTS prioridad              ordenes_servicio_prioridad_enum NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "slaHoras"             INTEGER,
  ADD COLUMN IF NOT EXISTS "fechaLimiteSla"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "esGarantia"           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "fechaVencimientoGarantia" DATE,
  ADD COLUMN IF NOT EXISTS "numeroSerieEquipo"    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "origenPortal"         BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_prioridad
  ON ordenes_servicio ("empresaId", prioridad)
  WHERE "isActive" = TRUE;

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_sla
  ON ordenes_servicio ("fechaLimiteSla")
  WHERE "fechaLimiteSla" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CUENTAS ESTADÍSTICAS
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE cuentas_estadisticas_tipo_enum AS ENUM ('acumulador','promedio','maximo','conteo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cuentas_estadisticas (
  id          SERIAL PRIMARY KEY,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId" INTEGER,
  codigo      VARCHAR(20) NOT NULL,
  nombre      VARCHAR(200) NOT NULL,
  descripcion TEXT,
  unidad      VARCHAR(50) NOT NULL DEFAULT 'unidades',
  tipo        cuentas_estadisticas_tipo_enum NOT NULL DEFAULT 'acumulador',
  categoria   VARCHAR(100),
  activa      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_cuentas_estadisticas_empresa
  ON cuentas_estadisticas ("empresaId");

CREATE TABLE IF NOT EXISTS movimientos_estadisticos (
  id           SERIAL PRIMARY KEY,
  "isActive"   BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"  INTEGER,
  "cuentaId"   INTEGER NOT NULL REFERENCES cuentas_estadisticas(id) ON DELETE CASCADE,
  fecha        DATE NOT NULL,
  valor        DECIMAL(18,4) NOT NULL,
  descripcion  VARCHAR(200),
  referencia   VARCHAR(50),
  "userId"     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_movimientos_estadisticos_cuenta
  ON movimientos_estadisticos ("empresaId", "cuentaId", fecha);

COMMIT;
