-- ============================================================================
-- Auditoría: suscripciones que aparecen vencidas o con saldo, pero ya pagaron
--
-- Nace del caso ELIDO (empresa 73, 2026-10-09): cargo de renovación del ciclo
-- 05/10→05/11 por RD$7,600 + cargo e-CF RD$2,400, pago manual confirmado de
-- RD$10,000. Saldo real 0 y la pantalla seguía diciendo "Saldo pendiente
-- RD$7,600 · Vencida hace 4 días".
--
-- Eran dos fallos:
--   (a) el ciclo con cargo se contaba dos veces, una en el saldo y otra como
--       "suscripción vencida" — ya corregido en 8ce6fa9b
--       (construirEstadoCuenta descuenta los ciclos que ya tienen cargo);
--   (b) el pago liquidaba el cargo de renovación pero NO movía
--       fechaVencimiento, porque la imputación solo avanzaba períodos con el
--       remanente DESPUÉS de los cargos — y el cargo de renovación se comía
--       justo ese remanente. Corregido ahora.
--
-- Este script busca las filas que quedaron mal por (b) mientras el bug vivió.
--
-- SOLO LECTURA. No escribe nada. Para corregir, ver
-- fix-vencimiento-renovacion-pagada.sql (que trae su propio dry-run).
--
-- Uso:
--   psql "$DATABASE_URL" -f scripts/auditoria-suscripciones-vencidas-pagadas.sql
--
-- ── Notas de schema (verificadas contra el código, no asumidas) ──
-- * El saldo real es la cuenta de PagosSuscripcionService.getSaldoPendiente():
--     CARGO suma; TRANSFERENCIA/TARJETA/MANUAL/CREDITO confirmados restan;
--     RECHAZADO se excluye por completo.
-- * Los cargos de renovación llevan "periodoInicio"/"periodoFin"; los cargos
--   por servicios (activación e-CF, excedente) los llevan en NULL.
-- * Un cargo está liquidado cuando monto <= "montoPagado".
-- ============================================================================

\echo ''
\echo '=== 1. Saldo real 0 o a favor, pero la pantalla las da por vencidas ==='
\echo ''

WITH saldo AS (
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
SELECT e.id                                   AS empresa,
       e.nombre,
       s.plan,
       s.estado                               AS estado_suscripcion,
       COALESCE(sa.saldo_real, 0)             AS saldo_real,
       to_char(s."fechaVencimiento",'YYYY-MM-DD') AS vence,
       (CURRENT_DATE - s."fechaVencimiento"::date) AS dias_vencida,
       s."enPeriodoGracia"                    AS en_gracia,
       to_char(s."fechaFinGracia",'YYYY-MM-DD')   AS fin_gracia
FROM suscripciones s
JOIN empresa e        ON e.id = s."empresaId"
LEFT JOIN saldo sa    ON sa."empresaId" = s."empresaId"
WHERE e."isActive" = true
  AND s."fechaVencimiento"::date < CURRENT_DATE   -- la pantalla la da por vencida
  AND COALESCE(sa.saldo_real, 0) <= 0             -- pero no debe nada
ORDER BY dias_vencida DESC, e.id;

\echo ''
\echo '=== 2. Pagaron el ciclo (cargo de renovación liquidado) y la fecha no avanzó ==='
\echo '    "deberia_vencer" es el periodoFin del último ciclo liquidado.'
\echo ''

WITH ciclos_pagados AS (
  SELECT "empresaId",
         MAX("periodoFin"::date) AS ultimo_ciclo_pagado
  FROM pagos_suscripcion
  WHERE tipo = 'CARGO'
    AND estado != 'RECHAZADO'
    AND "periodoFin" IS NOT NULL
    AND monto <= "montoPagado"          -- liquidado del todo
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
SELECT e.id                                      AS empresa,
       e.nombre,
       s.plan,
       s.estado                                  AS estado_suscripcion,
       COALESCE(sa.saldo_real, 0)                AS saldo_real,
       to_char(s."fechaVencimiento",'YYYY-MM-DD') AS vence_ahora,
       to_char(cp.ultimo_ciclo_pagado,'YYYY-MM-DD') AS deberia_vencer,
       (cp.ultimo_ciclo_pagado - s."fechaVencimiento"::date) AS dias_sin_acreditar
FROM suscripciones s
JOIN empresa e          ON e.id = s."empresaId"
JOIN ciclos_pagados cp  ON cp."empresaId" = s."empresaId"
LEFT JOIN saldo sa      ON sa."empresaId" = s."empresaId"
WHERE e."isActive" = true
  AND cp.ultimo_ciclo_pagado > s."fechaVencimiento"::date
ORDER BY dias_sin_acreditar DESC, e.id;

\echo ''
\echo '=== 3. Ciclos con cargo contados dos veces en pantalla ==='
\echo '    Períodos vencidos que YA tienen su cargo: el saldo los cuenta y'
\echo '    "suscripción vencida" los volvía a contar.'
\echo ''

SELECT p."empresaId"                              AS empresa,
       e.nombre,
       p.concepto,
       p.monto,
       p."montoPagado",
       to_char(p."periodoInicio",'YYYY-MM-DD')    AS ciclo_inicio,
       to_char(p."periodoFin",'YYYY-MM-DD')       AS ciclo_fin,
       CASE WHEN p.monto <= p."montoPagado" THEN 'liquidado' ELSE 'pendiente' END AS estado_cargo
FROM pagos_suscripcion p
JOIN empresa e       ON e.id = p."empresaId"
JOIN suscripciones s ON s."empresaId" = p."empresaId"
WHERE p.tipo = 'CARGO'
  AND p.estado != 'RECHAZADO'
  AND p."periodoInicio" IS NOT NULL
  AND p."periodoInicio"::date >= s."fechaVencimiento"::date  -- el período que la pantalla cobra aparte
  AND e."isActive" = true
ORDER BY p."empresaId", p."periodoInicio";

\echo ''
\echo '=== 4. Detalle de una empresa (cambia el 73 por la que quieras mirar) ==='
\echo ''

SELECT id, tipo, estado, concepto, monto, "montoPagado",
       to_char("periodoInicio",'YYYY-MM-DD') AS ciclo_inicio,
       to_char("periodoFin",'YYYY-MM-DD')    AS ciclo_fin,
       to_char("creadoEn",'YYYY-MM-DD HH24:MI') AS creado,
       to_char("confirmadoEn",'YYYY-MM-DD HH24:MI') AS confirmado
FROM pagos_suscripcion
WHERE "empresaId" = 73
ORDER BY "creadoEn";
