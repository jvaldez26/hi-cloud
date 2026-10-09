-- ============================================================================
-- Corrección de datos: acreditar los ciclos que se pagaron y no movieron la
-- fecha de vencimiento.
--
-- Contexto: hasta el fix del 2026-10-09, un pago que liquidaba el cargo de
-- renovación de un ciclo NO extendía suscripciones."fechaVencimiento" — la
-- imputación solo avanzaba períodos con el remanente que quedaba DESPUÉS de
-- pagar los cargos, y el cargo de renovación se comía justo ese remanente.
-- El código ya está corregido; esto arregla las filas que quedaron atrás.
--
-- Regla: si una empresa tiene cargos de renovación LIQUIDADOS cuyo periodoFin
-- es posterior a su fechaVencimiento actual, la fecha pasa a ese periodoFin.
-- Solo avanza; nunca retrocede una fecha.
--
--   ELIDO (empresa 73): 2026-10-05 → 2026-11-05
--
-- ── Cómo usarlo ──────────────────────────────────────────────────────────────
--   1. DRY-RUN (no escribe nada):
--        psql "$DATABASE_URL" -f scripts/fix-vencimiento-renovacion-pagada.sql
--   2. Revisar la tabla que imprime: una fila por empresa, con la fecha actual
--      y la que tendría.
--   3. Aplicar de verdad:
--        psql "$DATABASE_URL" -v aplicar=1 -f scripts/fix-vencimiento-renovacion-pagada.sql
--
-- Todo va dentro de una transacción: sin -v aplicar=1 termina en ROLLBACK, así
-- que el dry-run no puede escribir ni por accidente.
--
-- Cada fila tocada deja su rastro en suscripcion_auditoria con accion
-- FECHA_VENCIMIENTO_MANUAL, superAdminId NULL (lo hizo un script, no una
-- persona) y el motivo apuntando a este archivo.
-- ============================================================================

\set ON_ERROR_STOP on
-- `aplicar` sin definir → 0 (dry-run). Definido con -v aplicar=1 → escribe.
\if :{?aplicar} \else \set aplicar 0 \endif

BEGIN;

CREATE TEMP TABLE _a_corregir ON COMMIT DROP AS
WITH ciclos_pagados AS (
  SELECT "empresaId",
         MAX("periodoFin"::date) AS ultimo_ciclo_pagado
  FROM pagos_suscripcion
  WHERE tipo = 'CARGO'
    AND estado != 'RECHAZADO'
    AND "periodoFin" IS NOT NULL
    AND monto <= "montoPagado"              -- el cargo quedó liquidado
  GROUP BY "empresaId"
),
saldo AS (
  SELECT "empresaId",
         SUM(CASE
               WHEN tipo = 'CARGO' THEN monto
               WHEN tipo IN ('TRANSFERENCIA','TARJETA','MANUAL','CREDITO')
                    AND estado = 'CONFIRMADO' THEN -monto
               ELSE 0
             END)::numeric(12,2) AS saldo_real
  FROM pagos_suscripcion
  WHERE estado != 'RECHAZADO'
  GROUP BY "empresaId"
)
SELECT s.id                          AS suscripcion_id,
       s."empresaId"                 AS empresa_id,
       e.nombre                      AS empresa,
       s.plan,
       s."fechaVencimiento"::date    AS vence_ahora,
       cp.ultimo_ciclo_pagado        AS vence_corregido,
       COALESCE(sa.saldo_real, 0)    AS saldo_real
FROM suscripciones s
JOIN empresa e         ON e.id = s."empresaId"
JOIN ciclos_pagados cp ON cp."empresaId" = s."empresaId"
LEFT JOIN saldo sa     ON sa."empresaId" = s."empresaId"
WHERE e."isActive" = true
  AND cp.ultimo_ciclo_pagado > s."fechaVencimiento"::date;   -- solo avanza

\echo ''
\echo '=== Empresas a corregir ==='
SELECT empresa_id, empresa, plan, vence_ahora, vence_corregido,
       (vence_corregido - vence_ahora) AS dias_acreditados,
       saldo_real
FROM _a_corregir
ORDER BY dias_acreditados DESC, empresa_id;

\echo ''
SELECT COUNT(*) AS empresas_afectadas FROM _a_corregir;

-- ── Escritura (solo con -v aplicar=1) ───────────────────────────────────────

\if :aplicar

\echo ''
\echo '>>> APLICANDO cambios...'

INSERT INTO suscripcion_auditoria
  ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo)
SELECT suscripcion_id,
       empresa_id,
       'FECHA_VENCIMIENTO_MANUAL',
       jsonb_build_object('fechaVencimiento', vence_ahora),
       jsonb_build_object('fechaVencimiento', vence_corregido),
       NULL,
       'Corrección masiva: el pago liquidó el cargo de renovación pero la ' ||
       'imputación no extendía el vencimiento (bug corregido el 2026-10-09). ' ||
       'scripts/fix-vencimiento-renovacion-pagada.sql'
FROM _a_corregir;

UPDATE suscripciones s
SET "fechaVencimiento" = c.vence_corregido,
    "enPeriodoGracia"  = false,
    "fechaFinGracia"   = NULL,
    "updatedAt"        = NOW()
FROM _a_corregir c
WHERE s.id = c.suscripcion_id;

\echo ''
\echo '=== Resultado ==='
SELECT c.empresa_id, c.empresa,
       to_char(s."fechaVencimiento",'YYYY-MM-DD') AS vence_ahora,
       s."enPeriodoGracia" AS en_gracia
FROM _a_corregir c
JOIN suscripciones s ON s.id = c.suscripcion_id
ORDER BY c.empresa_id;

COMMIT;
\echo '>>> Cambios aplicados.'

\else

ROLLBACK;
\echo ''
\echo '>>> DRY-RUN: no se escribió nada. Para aplicar:'
\echo '>>>   psql "$DATABASE_URL" -v aplicar=1 -f scripts/fix-vencimiento-renovacion-pagada.sql'

\endif
