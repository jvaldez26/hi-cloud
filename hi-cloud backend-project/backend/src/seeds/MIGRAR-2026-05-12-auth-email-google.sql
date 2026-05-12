-- ============================================================================
-- Migración: Email verification + Google OAuth fields en users
-- Fecha: 2026-05-12
-- ============================================================================

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt"          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "emailVerificationToken"   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "emailVerificationExpires" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider                   VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "googleId"                 VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "googleAccessToken"        TEXT;

-- Marcar usuarios existentes como ya verificados
-- (fueron creados antes de implementar la verificación)
UPDATE users
  SET "emailVerifiedAt" = "createdAt"
  WHERE "emailVerifiedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON users("emailVerificationToken")
  WHERE "emailVerificationToken" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_google_id
  ON users("googleId")
  WHERE "googleId" IS NOT NULL;

COMMIT;
