-- ============================================================================
-- Migración: Sistema de Backups Automáticos
-- Fecha: 2026-05-12
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS backup_registros (
  id                    SERIAL PRIMARY KEY,
  tipo                  VARCHAR(10)  NOT NULL DEFAULT 'daily'
                          CHECK (tipo IN ('daily','weekly','monthly','manual')),
  estado                VARCHAR(20)  NOT NULL DEFAULT 'EN_PROGRESO'
                          CHECK (estado IN ('EXITOSO','FALLIDO','EN_PROGRESO')),
  "s3Key"               VARCHAR(300),
  tamanio               VARCHAR(20),
  "duracionSegundos"    INTEGER,
  checksum              VARCHAR(64),
  "errorMensaje"        TEXT,
  "integridadVerificada" BOOLEAN NOT NULL DEFAULT FALSE,
  "verificadoEn"        TIMESTAMPTZ,
  "iniciadoPor"         INTEGER,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_estado_fecha ON backup_registros(estado, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_backup_tipo_fecha   ON backup_registros(tipo,   "createdAt" DESC);

COMMIT;
