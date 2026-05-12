-- ============================================================================
-- Migración: Reportes DGII 606/607/608
-- Fecha: 2026-05-11
-- Ejecutar en pgAdmin o psql
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla de historial de reportes DGII generados
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reportes_dgii (
  id              SERIAL PRIMARY KEY,
  "empresaId"     INTEGER NOT NULL,
  tipo            VARCHAR(3) NOT NULL CHECK (tipo IN ('606','607','608')),
  mes             INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio            INTEGER NOT NULL,
  "totalLineas"   INTEGER NOT NULL DEFAULT 0,
  "totalMonto"    DECIMAL(18,2) NOT NULL DEFAULT 0,
  errores         INTEGER NOT NULL DEFAULT 0,
  advertencias    INTEGER NOT NULL DEFAULT 0,
  "generadoPor"   INTEGER,
  "hashContenido" VARCHAR(64),
  contenido       TEXT,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reportes_dgii_empresa ON reportes_dgii("empresaId");
CREATE INDEX IF NOT EXISTS idx_reportes_dgii_periodo ON reportes_dgii("empresaId", tipo, anio, mes);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Campos nuevos en tabla compras
-- ─────────────────────────────────────────────────────────────────────────────

-- Tipo de bienes/servicios según tabla DGII (01-11)
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS "tipoBienes"  VARCHAR(2);

-- Forma de pago normalizada según DGII (01-07)
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS "formaPago"   VARCHAR(2);

-- Fecha de pago efectiva (puede diferir de la fecha del comprobante)
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS "fechaPago"   DATE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Poblar formaPago en compras existentes según notas (best-effort)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE compras SET "formaPago" = '01'
  WHERE "formaPago" IS NULL
    AND LOWER(notas) LIKE '%efectivo%';

UPDATE compras SET "formaPago" = '03'
  WHERE "formaPago" IS NULL
    AND LOWER(notas) LIKE '%tarjeta%';

UPDATE compras SET "formaPago" = '02'
  WHERE "formaPago" IS NULL
    AND (LOWER(notas) LIKE '%transfer%' OR LOWER(notas) LIKE '%cheque%');

UPDATE compras SET "formaPago" = '04'
  WHERE "formaPago" IS NULL
    AND LOWER(notas) LIKE '%crédito%';

-- Fallback: las que queden sin clasificar → crédito (04) más común en compras
UPDATE compras SET "formaPago" = '04'
  WHERE "formaPago" IS NULL;

-- Poblar fechaPago con fecha de la compra para registros históricos
UPDATE compras SET "fechaPago" = fecha
  WHERE "fechaPago" IS NULL;

-- tipoBienes → '09' (Compras y gastos del costo de venta) como default
UPDATE compras SET "tipoBienes" = '09'
  WHERE "tipoBienes" IS NULL;

COMMIT;
