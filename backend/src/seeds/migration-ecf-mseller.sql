-- =============================================================================
-- Migración: Integración MSeller e-CF
-- Fecha: 2026-05-06
-- Descripción: Agrega soporte para MSeller como pasarela e-CF.
--   1. Nuevos valores al enum estadoDGII
--   2. Nuevas columnas en tabla ecf
--   3. Nueva tabla empresa_ecf_config
--   4. Nueva tabla ecf_eventos
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENDER ENUM ecf_estadodgii_enum
-- (ADD VALUE no puede correr dentro de transacción en PG < 12; en PG 12+ sí)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE ecf_estadodgii_enum ADD VALUE IF NOT EXISTS 'borrador';
ALTER TYPE ecf_estadodgii_enum ADD VALUE IF NOT EXISTS 'pendiente_envio';
ALTER TYPE ecf_estadodgii_enum ADD VALUE IF NOT EXISTS 'enviado';
ALTER TYPE ecf_estadodgii_enum ADD VALUE IF NOT EXISTS 'observado';
ALTER TYPE ecf_estadodgii_enum ADD VALUE IF NOT EXISTS 'contingencia';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NUEVAS COLUMNAS EN TABLA ecf
-- ─────────────────────────────────────────────────────────────────────────────

-- Origen del documento (generaliza facturaId para soportar POS)
ALTER TABLE ecf
  ADD COLUMN IF NOT EXISTS "documentoOrigenTipo" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "documentoOrigenId"   INTEGER;

-- Tracking MSeller
ALTER TABLE ecf
  ADD COLUMN IF NOT EXISTS "trackId" VARCHAR(36),
  ADD COLUMN IF NOT EXISTS "qrUrl"   TEXT;

-- Payloads JSON (MSeller trabaja con JSON, no XML)
ALTER TABLE ecf
  ADD COLUMN IF NOT EXISTS "jsonEnviado"      JSONB,
  ADD COLUMN IF NOT EXISTS "respuestaMSeller" JSONB,
  ADD COLUMN IF NOT EXISTS "respuestaDgii"    JSONB;

-- Datos del comprador denormalizados
ALTER TABLE ecf
  ADD COLUMN IF NOT EXISTS "rncComprador"         VARCHAR(11),
  ADD COLUMN IF NOT EXISTS "razonSocialComprador"  VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "direccionComprador"    VARCHAR(400);

-- Montos denormalizados para reportes sin JOIN
ALTER TABLE ecf
  ADD COLUMN IF NOT EXISTS "montoExento"  DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "montoGravado" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "montoItbis"   DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "montoTotal"   DECIMAL(18,2);

-- Índices en las nuevas columnas
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecf_track_id
  ON ecf ("trackId")
  WHERE "trackId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ecf_origen
  ON ecf ("documentoOrigenTipo", "documentoOrigenId")
  WHERE "documentoOrigenTipo" IS NOT NULL;

-- Garantía de idempotencia: solo un e-CF ACEPTADO por documento origen
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecf_origen_unico_aceptado
  ON ecf ("documentoOrigenTipo", "documentoOrigenId")
  WHERE "estadoDGII" = 'aceptado';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. NUEVA TABLA empresa_ecf_config
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresa_ecf_config (
  id                    SERIAL PRIMARY KEY,
  "empresaId"           INTEGER NOT NULL UNIQUE,

  -- Credenciales MSeller cifradas (AES-256-GCM)
  -- Formato: "<iv_b64>.<authTag_b64>.<ciphertext_b64>"
  "msellerEmail"        VARCHAR(150),
  "msellerPasswordEnc"  TEXT,
  "msellerApiKeyEnc"    TEXT,

  -- Entorno MSeller
  "msellerUrlBase"      VARCHAR(300) NOT NULL DEFAULT 'https://ecf.api.mseller.app',
  modo                  VARCHAR(20)  NOT NULL DEFAULT 'TEST'
                          CHECK (modo IN ('TEST', 'CERTIFICACION', 'PRODUCCION')),

  -- Datos fiscales del emisor para los documentos e-CF
  "rncEmisor"           VARCHAR(11),
  "razonSocialEmisor"   VARCHAR(300),
  "nombreComercial"     VARCHAR(200),
  "direccionEmisor"     VARCHAR(400),
  municipio             VARCHAR(100),
  provincia             VARCHAR(100),

  -- Control
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empresa_ecf_config_empresa
  ON empresa_ecf_config ("empresaId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. NUEVA TABLA ecf_eventos  (auditoría de cada e-CF)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ecf_evento_enum AS ENUM (
    'CREADO', 'ENVIADO', 'RESPUESTA_RECIBIDA',
    'REINTENTO', 'ERROR', 'ESTADO_CAMBIADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ecf_eventos (
  id              SERIAL PRIMARY KEY,
  "comprobanteId" INTEGER NOT NULL REFERENCES ecf(id) ON DELETE CASCADE,
  evento          ecf_evento_enum NOT NULL,
  payload         JSONB,
  mensaje         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecf_eventos_comprobante
  ON ecf_eventos ("comprobanteId");

CREATE INDEX IF NOT EXISTS idx_ecf_eventos_created
  ON ecf_eventos ("createdAt" DESC);

COMMIT;
