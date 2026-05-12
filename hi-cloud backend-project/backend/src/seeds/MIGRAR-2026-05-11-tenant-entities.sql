-- ============================================================================
-- Migración: TenantBaseEntity en módulos pendientes + drop unique globals
-- Fecha: 2026-05-11
-- Ejecutar TODO de una sola vez en pgAdmin o psql
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Agregar empresaId a tablas que NO lo tenían
-- ─────────────────────────────────────────────────────────────────────────────

-- Tesorería: cuentas_bancarias, movimientos_bancarios, conciliaciones_bancarias
ALTER TABLE cuentas_bancarias
  ADD COLUMN IF NOT EXISTS "empresaId" INTEGER;

ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS "empresaId" INTEGER;

ALTER TABLE conciliaciones_bancarias
  ADD COLUMN IF NOT EXISTS "empresaId" INTEGER;

-- Activos Fijos: depreciaciones_activos, categorias_activos
ALTER TABLE depreciaciones_activos
  ADD COLUMN IF NOT EXISTS "empresaId" INTEGER;

ALTER TABLE categorias_activos
  ADD COLUMN IF NOT EXISTS "empresaId" INTEGER;

-- Presupuestos: presupuesto_lineas
ALTER TABLE presupuesto_lineas
  ADD COLUMN IF NOT EXISTS "empresaId" INTEGER;

-- Contabilidad: asiento_lineas (ya tiene el índice del migration anterior, falta la columna)
ALTER TABLE asiento_lineas
  ADD COLUMN IF NOT EXISTS "empresaId" INTEGER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Agregar isActive y timestamps a tablas que usaban clase base manual
--    (solo si no existen — tablas de servicios, flota, licitaciones, objetivos
--    ya tenían estos campos; las nuevas de tesorería/activos no)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cuentas_bancarias
  ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE conciliaciones_bancarias
  ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE depreciaciones_activos
  ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE categorias_activos
  ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE presupuesto_lineas
  ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE asiento_lineas
  ADD COLUMN IF NOT EXISTS "isActive"  BOOLEAN NOT NULL DEFAULT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Eliminar constraints UNIQUE globales (deben ser únicos por empresa)
-- ─────────────────────────────────────────────────────────────────────────────

-- asientos_contables.numero
DO $$ BEGIN
  ALTER TABLE asientos_contables DROP CONSTRAINT IF EXISTS "UQ_asientos_contables_numero";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE asientos_contables DROP CONSTRAINT IF EXISTS asientos_contables_numero_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- activos_fijos.codigo
DO $$ BEGIN
  ALTER TABLE activos_fijos DROP CONSTRAINT IF EXISTS "UQ_activos_fijos_codigo";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE activos_fijos DROP CONSTRAINT IF EXISTS activos_fijos_codigo_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- licitaciones.codigo
DO $$ BEGIN
  ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS "UQ_licitaciones_codigo";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS licitaciones_codigo_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- vehiculos.placa
DO $$ BEGIN
  ALTER TABLE vehiculos DROP CONSTRAINT IF EXISTS "UQ_vehiculos_placa";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehiculos DROP CONSTRAINT IF EXISTS vehiculos_placa_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- cuentas_bancarias.numeroCuenta
DO $$ BEGIN
  ALTER TABLE cuentas_bancarias DROP CONSTRAINT IF EXISTS "UQ_cuentas_bancarias_numeroCuenta";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE cuentas_bancarias DROP CONSTRAINT IF EXISTS "cuentas_bancarias_numeroCuenta_key";
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ordenes_servicio.numero
DO $$ BEGIN
  ALTER TABLE ordenes_servicio DROP CONSTRAINT IF EXISTS "UQ_ordenes_servicio_numero";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE ordenes_servicio DROP CONSTRAINT IF EXISTS ordenes_servicio_numero_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- categorias_activos.codigo
DO $$ BEGIN
  ALTER TABLE categorias_activos DROP CONSTRAINT IF EXISTS "UQ_categorias_activos_codigo";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE categorias_activos DROP CONSTRAINT IF EXISTS categorias_activos_codigo_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- cuentas_contables (unique per empresa, not global)
DO $$ BEGIN
  ALTER TABLE cuentas_contables DROP CONSTRAINT IF EXISTS "UQ_cuentas_contables_codigo";
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE cuentas_contables DROP CONSTRAINT IF EXISTS cuentas_contables_codigo_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Índices empresaId en tablas nuevas
--    (CREATE INDEX CONCURRENTLY no puede ir dentro de transacción)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cuentas_bancarias_eid      ON cuentas_bancarias("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movimientos_bancarios_eid   ON movimientos_bancarios("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conciliaciones_eid          ON conciliaciones_bancarias("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_depreciaciones_activos_eid  ON depreciaciones_activos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categorias_activos_eid      ON categorias_activos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_presupuesto_lineas_eid      ON presupuesto_lineas("empresaId");
