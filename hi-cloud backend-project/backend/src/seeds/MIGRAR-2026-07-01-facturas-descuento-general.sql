-- ============================================================================
-- Migración: Agregar campos de descuento general a facturas
-- Fecha: 2026-07-01
-- ============================================================================

BEGIN;

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS "descuentoGeneralPct"   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "descuentoGeneralMonto"  DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN facturas."descuentoGeneralPct"
  IS 'Descuento global sobre el subtotal (porcentaje 0-100). Mutuamente exclusivo con descuentoGeneralMonto.';
COMMENT ON COLUMN facturas."descuentoGeneralMonto"
  IS 'Descuento global sobre el subtotal (monto fijo en moneda de la factura).';

COMMIT;
