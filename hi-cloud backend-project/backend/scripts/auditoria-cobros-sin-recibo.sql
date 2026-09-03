-- ============================================================================
-- Auditoría: facturas "pagada" sin rastro de cobro registrado
--
-- Una factura queda CON RASTRO si tiene, al menos, uno de estos cuatro:
--   1) formas de pago propias declaradas al emitir (venta de contado / POS)
--                                                          (facturas."formasPago")
--   2) un recibo de cobro activo apuntando a ella           (recibos_cobro)
--   3) un pago/anticipo aplicado a su cuenta por cobrar     (cuentas_por_cobrar + pagos_cobrados)
--   4) una nota de crédito que ya surtió efecto sobre ella  (notas_credito)
--
-- SOLO LECTURA. No escribe nada (ni siquiera tablas temporales: el WITH se
-- repite completo en cada sección porque psql no comparte un CTE entre
-- sentencias separadas por ';').
--
-- Uso:
--   psql ... -v dias=30 -f scripts/auditoria-cobros-sin-recibo.sql   últimos 30 días (por fecha de emisión)
--   psql ... -f scripts/auditoria-cobros-sin-recibo.sql              default: 30 días si no se pasa -v dias=
--
-- ── Notas de schema (verificado contra las entidades TypeORM, no asumido) ──
--
-- * Las ventas de CONTADO (no crédito) se marcan 'pagada' al emitir y el
--   cobro queda solo en `facturas."formasPago"` (jsonb: [{tipo,monto,ref}]).
--   No generan recibos_cobro ni CxC (facturas.service.ts:1072/1090). Sin esta
--   pata, el 99% de las facturas de contado salían como falso "sin rastro".
--
-- * NO existe una tabla `anticipo_aplicaciones`. Un anticipo aplicado a una
--   factura pasa por `cuentas_por_cobrar.facturaId` (1:1 con la factura) y
--   `pagos_cobrados.cuentaPorCobrarId` (el pago en sí, incluye anticipos
--   aplicados vía AnticiposClienteService.aplicar()).
--
-- * `notas_credito.estado` solo tiene los valores: borrador | emitida |
--   anulada | rechazada. NO existe 'aceptada'. El campo que indica que la NC
--   ya surtió efecto (reduce lo adeudado) es `efectosAplicados` (boolean).
--   Se usa estado='emitida' AND efectosAplicados=true como equivalente a
--   "NC aceptada y con rastro".
--
-- * `facturas` NO tiene ninguna columna de fecha dedicada al cambio a
--   'pagada' (no hay fechaPago/pagadaEn). Se usa `updatedAt` como
--   APROXIMACIÓN — puede reflejar cualquier otra edición posterior a la
--   factura, no solo el cambio de estado. Se etiqueta como tal en §3.
-- ============================================================================

\pset border 2
\pset format aligned

\if :{?dias}
\else
  \set dias 30
\endif

-- ============================================================================
-- §1 RESUMEN EJECUTIVO
-- ============================================================================
\echo '============================================================'
\echo ' SECCION 1 — RESUMEN EJECUTIVO'
\echo ' Ventana: ultimos' :dias 'dias (por fecha de emision)'
\echo '============================================================'
WITH ventana AS (
  SELECT (CURRENT_DATE - (:dias || ' days')::interval)::date AS desde
),
facturas_pagadas AS (
  SELECT f.id, f.folio, f."empresaId", f."clienteId", f.total,
         f.fecha AS fecha_emitida, f."updatedAt" AS actualizada_en_aprox,
         f."formasPago"
  FROM facturas f, ventana v
  WHERE f.estado = 'pagada' AND f.fecha >= v.desde
),
con_formapago AS (
  SELECT id AS "facturaId" FROM facturas_pagadas
  WHERE "formasPago" IS NOT NULL AND jsonb_array_length("formasPago") > 0
),
con_recibo AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN recibos_cobro rc ON rc."facturaId" = fp.id AND rc."isActive" = true
),
con_anticipo AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN cuentas_por_cobrar cxc ON cxc."facturaId" = fp.id
  JOIN pagos_cobrados pc      ON pc."cuentaPorCobrarId" = cxc.id
),
con_nc AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN notas_credito nc ON nc."facturaOriginalId" = fp.id
   AND nc.estado = 'emitida' AND nc."efectosAplicados" = true
),
clasificadas AS (
  SELECT fp.*,
    (cf."facturaId" IS NOT NULL) AS tiene_formapago,
    (cr."facturaId" IS NOT NULL) AS tiene_recibo,
    (ca."facturaId" IS NOT NULL) AS tiene_anticipo,
    (cn."facturaId" IS NOT NULL) AS tiene_nc,
    (cf."facturaId" IS NOT NULL OR cr."facturaId" IS NOT NULL
     OR ca."facturaId" IS NOT NULL OR cn."facturaId" IS NOT NULL) AS con_rastro
  FROM facturas_pagadas fp
  LEFT JOIN con_formapago cf ON cf."facturaId" = fp.id
  LEFT JOIN con_recibo    cr ON cr."facturaId" = fp.id
  LEFT JOIN con_anticipo  ca ON ca."facturaId" = fp.id
  LEFT JOIN con_nc        cn ON cn."facturaId" = fp.id
)
SELECT categoria, cantidad, to_char(monto, 'FM999,999,999,990.00') AS "monto_RD$"
FROM (
  SELECT 0, 'TOTAL facturas "pagada" en la ventana', count(*), coalesce(sum(total), 0)
  FROM clasificadas
  UNION ALL
  SELECT 1, '  CON rastro (total)',
         count(*) FILTER (WHERE con_rastro), coalesce(sum(total) FILTER (WHERE con_rastro), 0)
  FROM clasificadas
  UNION ALL
  SELECT 2, '    - formas de pago propias (contado/POS)',
         count(*) FILTER (WHERE tiene_formapago), coalesce(sum(total) FILTER (WHERE tiene_formapago), 0)
  FROM clasificadas
  UNION ALL
  SELECT 3, '    - recibo de cobro activo',
         count(*) FILTER (WHERE tiene_recibo), coalesce(sum(total) FILTER (WHERE tiene_recibo), 0)
  FROM clasificadas
  UNION ALL
  SELECT 4, '    - anticipo/pago aplicado (CxC)',
         count(*) FILTER (WHERE tiene_anticipo), coalesce(sum(total) FILTER (WHERE tiene_anticipo), 0)
  FROM clasificadas
  UNION ALL
  SELECT 5, '    - nota de credito emitida con efecto',
         count(*) FILTER (WHERE tiene_nc), coalesce(sum(total) FILTER (WHERE tiene_nc), 0)
  FROM clasificadas
  UNION ALL
  SELECT 6, '  SIN rastro',
         count(*) FILTER (WHERE NOT con_rastro), coalesce(sum(total) FILTER (WHERE NOT con_rastro), 0)
  FROM clasificadas
) resumen(orden, categoria, cantidad, monto)
ORDER BY orden;

-- ============================================================================
-- §2 DESGLOSE POR EMPRESA
-- ============================================================================
\echo ''
\echo '============================================================'
\echo ' SECCION 2 — DESGLOSE POR EMPRESA'
\echo '============================================================'
WITH ventana AS (
  SELECT (CURRENT_DATE - (:dias || ' days')::interval)::date AS desde
),
facturas_pagadas AS (
  SELECT f.id, f.folio, f."empresaId", f."clienteId", f.total,
         f.fecha AS fecha_emitida, f."updatedAt" AS actualizada_en_aprox,
         f."formasPago"
  FROM facturas f, ventana v
  WHERE f.estado = 'pagada' AND f.fecha >= v.desde
),
con_formapago AS (
  SELECT id AS "facturaId" FROM facturas_pagadas
  WHERE "formasPago" IS NOT NULL AND jsonb_array_length("formasPago") > 0
),
con_recibo AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN recibos_cobro rc ON rc."facturaId" = fp.id AND rc."isActive" = true
),
con_anticipo AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN cuentas_por_cobrar cxc ON cxc."facturaId" = fp.id
  JOIN pagos_cobrados pc      ON pc."cuentaPorCobrarId" = cxc.id
),
con_nc AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN notas_credito nc ON nc."facturaOriginalId" = fp.id
   AND nc.estado = 'emitida' AND nc."efectosAplicados" = true
),
clasificadas AS (
  SELECT fp.*,
    (cf."facturaId" IS NOT NULL OR cr."facturaId" IS NOT NULL
     OR ca."facturaId" IS NOT NULL OR cn."facturaId" IS NOT NULL) AS con_rastro
  FROM facturas_pagadas fp
  LEFT JOIN con_formapago cf ON cf."facturaId" = fp.id
  LEFT JOIN con_recibo    cr ON cr."facturaId" = fp.id
  LEFT JOIN con_anticipo  ca ON ca."facturaId" = fp.id
  LEFT JOIN con_nc        cn ON cn."facturaId" = fp.id
)
SELECT
  coalesce(nullif(trim(e."nombreComercial"), ''), nullif(trim(e.nombre), ''), 'Empresa #' || e.id) AS empresa,
  count(*) AS total_facturas,
  count(*) FILTER (WHERE c.con_rastro) AS con_rastro,
  count(*) FILTER (WHERE NOT c.con_rastro) AS sin_rastro,
  to_char(coalesce(sum(c.total) FILTER (WHERE NOT c.con_rastro), 0), 'FM999,999,999,990.00') AS "monto_sin_rastro_RD$",
  to_char(coalesce(sum(c.total), 0), 'FM999,999,999,990.00') AS "monto_total_RD$"
FROM clasificadas c
JOIN empresa e ON e.id = c."empresaId"
GROUP BY e.id, e."nombreComercial", e.nombre
ORDER BY sum(c.total) FILTER (WHERE NOT c.con_rastro) DESC NULLS LAST;

-- ============================================================================
-- §3 FACTURAS SIN RASTRO (detalle)
-- ============================================================================
\echo ''
\echo '============================================================'
\echo ' SECCION 3 — FACTURAS SIN RASTRO (detalle)'
\echo ' fecha_actualizada_aprox: NO es una fecha de pago dedicada'
\echo ' (no existe esa columna); es facturas.updatedAt.'
\echo '============================================================'
WITH ventana AS (
  SELECT (CURRENT_DATE - (:dias || ' days')::interval)::date AS desde
),
facturas_pagadas AS (
  SELECT f.id, f.folio, f."empresaId", f."clienteId", f.total,
         f.fecha AS fecha_emitida, f."updatedAt" AS actualizada_en_aprox,
         f."formasPago"
  FROM facturas f, ventana v
  WHERE f.estado = 'pagada' AND f.fecha >= v.desde
),
con_formapago AS (
  SELECT id AS "facturaId" FROM facturas_pagadas
  WHERE "formasPago" IS NOT NULL AND jsonb_array_length("formasPago") > 0
),
con_recibo AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN recibos_cobro rc ON rc."facturaId" = fp.id AND rc."isActive" = true
),
con_anticipo AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN cuentas_por_cobrar cxc ON cxc."facturaId" = fp.id
  JOIN pagos_cobrados pc      ON pc."cuentaPorCobrarId" = cxc.id
),
con_nc AS (
  SELECT DISTINCT fp.id AS "facturaId"
  FROM facturas_pagadas fp
  JOIN notas_credito nc ON nc."facturaOriginalId" = fp.id
   AND nc.estado = 'emitida' AND nc."efectosAplicados" = true
),
clasificadas AS (
  SELECT fp.*,
    (cf."facturaId" IS NOT NULL OR cr."facturaId" IS NOT NULL
     OR ca."facturaId" IS NOT NULL OR cn."facturaId" IS NOT NULL) AS con_rastro
  FROM facturas_pagadas fp
  LEFT JOIN con_formapago cf ON cf."facturaId" = fp.id
  LEFT JOIN con_recibo    cr ON cr."facturaId" = fp.id
  LEFT JOIN con_anticipo  ca ON ca."facturaId" = fp.id
  LEFT JOIN con_nc        cn ON cn."facturaId" = fp.id
)
SELECT
  coalesce(nullif(trim(e."nombreComercial"), ''), nullif(trim(e.nombre), ''), 'Empresa #' || e.id) AS empresa,
  c.folio,
  coalesce(cl."razonSocial", cl.nombre, '(sin cliente)') AS cliente,
  to_char(c.total, 'FM999,999,990.00') AS "total_RD$",
  c.fecha_emitida,
  c.actualizada_en_aprox::date AS fecha_actualizada_aprox
FROM clasificadas c
JOIN empresa e ON e.id = c."empresaId"
LEFT JOIN clientes cl ON cl.id = c."clienteId"
WHERE NOT c.con_rastro
ORDER BY coalesce(nullif(trim(e."nombreComercial"), ''), nullif(trim(e.nombre), ''), 'Empresa #' || e.id), c.total DESC;
