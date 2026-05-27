-- ============================================================================
-- Migración: Agregar facturaRecurrenteId a facturas para trazabilidad
-- Fecha: 2026-05-27
-- ============================================================================

BEGIN;

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS "facturaRecurrenteId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_facturas_recurrente_id
  ON facturas("facturaRecurrenteId")
  WHERE "facturaRecurrenteId" IS NOT NULL;

COMMENT ON COLUMN facturas."facturaRecurrenteId"
  IS 'ID de la FacturaRecurrente (plantilla) que generó esta factura. NULL si fue creada manualmente.';

COMMIT;
