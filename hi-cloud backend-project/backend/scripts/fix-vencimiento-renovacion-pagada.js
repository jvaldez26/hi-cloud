#!/usr/bin/env node
/**
 * Corrección: acreditar los ciclos que se pagaron y no movieron la fecha.
 *
 * Hasta el fix 3b879964, un pago que liquidaba el cargo de renovación de un
 * ciclo NO extendía suscripciones."fechaVencimiento": la imputación solo
 * avanzaba períodos con el remanente que quedaba DESPUÉS de pagar los cargos,
 * y el cargo de renovación se comía justo ese remanente. El código ya está
 * corregido; esto arregla las filas que quedaron atrás.
 *
 * Regla: si una empresa tiene cargos de renovación LIQUIDADOS cuyo periodoFin
 * es posterior a su fechaVencimiento actual, la fecha pasa a ese periodoFin.
 * Solo avanza; nunca retrocede una fecha.
 *
 *   ELIDO (empresa 73): 2026-10-05 → 2026-11-05
 *
 * ── Cómo usarlo ─────────────────────────────────────────────────────────────
 *   node scripts/fix-vencimiento-renovacion-pagada.js              DRY-RUN
 *   node scripts/fix-vencimiento-renovacion-pagada.js --confirmar  escribe
 *
 * El dry-run hace el trabajo completo —INSERT de auditoría y UPDATE incluidos—
 * dentro de una transacción y termina en ROLLBACK, así que lo que imprime es
 * exactamente lo que pasaría, no una simulación aparte. Con --confirmar, la
 * misma transacción termina en COMMIT.
 *
 * Cada fila tocada deja rastro en suscripcion_auditoria, accion
 * FECHA_VENCIMIENTO_MANUAL, superAdminId NULL (lo hizo un script, no una
 * persona) y el motivo apuntando a este archivo.
 *
 * Credenciales: .env.prod.bak (o --env=ruta\al\archivo).
 */
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const args      = process.argv.slice(2);
const CONFIRMAR = args.includes('--confirmar');
const argEnv    = (args.find(a => a.startsWith('--env=')) || '').split('=')[1];
const soloEmpresa = Number((args.find(a => a.startsWith('--empresa=')) || '').split('=')[1]) || null;

const CANDIDATOS = [
  argEnv,
  path.resolve(process.cwd(), '.env.prod.bak'),
  path.resolve(__dirname, '..', '.env.prod.bak'),
  path.resolve(__dirname, '..', '..', '.env.prod.bak'),
  path.resolve(__dirname, '..', '..', '..', '.env.prod.bak'),
].filter(Boolean);

const envPath = CANDIDATOS.find(p => fs.existsSync(p));
if (!envPath) {
  console.error('No encontré .env.prod.bak. Busqué en:');
  for (const c of CANDIDATOS) console.error('  ' + c);
  console.error('');
  console.error('Pásalo a mano:  node scripts/fix-vencimiento-renovacion-pagada.js --env=C:\\ruta\\.env.prod.bak');
  process.exit(1);
}
require('dotenv').config({ path: envPath });
console.log('Credenciales: ' + envPath);
console.log(CONFIRMAR
  ? 'Modo: --confirmar  → la transacción termina en COMMIT'
  : 'Modo: DRY-RUN      → la transacción termina en ROLLBACK (no escribe nada)');
console.log('');

const cliente = () => new Client({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const MOTIVO =
  'Corrección masiva: el pago liquidó el cargo de renovación pero la imputación ' +
  'no extendía el vencimiento (bug corregido el 2026-10-09, commit 3b879964). ' +
  'scripts/fix-vencimiento-renovacion-pagada.js';

/** A quién hay que corregir y hasta qué fecha. */
const A_CORREGIR = `
  WITH ciclos_pagados AS (
    SELECT "empresaId", MAX("periodoFin"::date) AS ultimo_ciclo_pagado
    FROM pagos_suscripcion
    WHERE tipo = 'CARGO' AND estado != 'RECHAZADO'
      AND "periodoFin" IS NOT NULL
      AND monto <= "montoPagado"
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
  SELECT s.id                       AS suscripcion_id,
         s."empresaId"              AS empresa_id,
         e.nombre                   AS empresa,
         s.plan,
         s."fechaVencimiento"::date AS vence_ahora,
         cp.ultimo_ciclo_pagado     AS vence_corregido,
         (cp.ultimo_ciclo_pagado - s."fechaVencimiento"::date) AS dias_acreditados,
         COALESCE(sa.saldo_real, 0) AS saldo_real
  FROM suscripciones s
  JOIN empresa e         ON e.id = s."empresaId"
  JOIN ciclos_pagados cp ON cp."empresaId" = s."empresaId"
  LEFT JOIN saldo sa     ON sa."empresaId" = s."empresaId"
  WHERE e."isActive" = true
    AND cp.ultimo_ciclo_pagado > s."fechaVencimiento"::date
    AND ($1::int IS NULL OR s."empresaId" = $1::int)
  ORDER BY dias_acreditados DESC, s."empresaId"
`;

(async () => {
  const c = cliente();
  await c.connect();
  await c.query('BEGIN');

  try {
    const pendientes = await c.query(A_CORREGIR, [soloEmpresa]);

    console.log('=== Empresas a corregir ===');
    if (pendientes.rows.length === 0) {
      console.log('  (ninguna)');
      await c.query('ROLLBACK');
      await c.end();
      return;
    }
    console.table(pendientes.rows.map(r => ({
      empresa:          r.empresa_id,
      nombre:           r.empresa,
      plan:             r.plan,
      vence_ahora:      String(r.vence_ahora).slice(0, 10),
      vence_corregido:  String(r.vence_corregido).slice(0, 10),
      dias_acreditados: r.dias_acreditados,
      saldo_real:       r.saldo_real,
    })));

    // El trabajo real: se hace SIEMPRE, y es el ROLLBACK/COMMIT del final el
    // que decide si queda. Así el dry-run no es una simulación aparte que
    // pueda divergir de lo que de verdad pasaría.
    for (const r of pendientes.rows) {
      await c.query(
        `INSERT INTO suscripcion_auditoria
           ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo)
         VALUES ($1,$2,'FECHA_VENCIMIENTO_MANUAL',$3,$4,NULL,$5)`,
        [
          r.suscripcion_id,
          r.empresa_id,
          JSON.stringify({ fechaVencimiento: String(r.vence_ahora).slice(0, 10) }),
          JSON.stringify({ fechaVencimiento: String(r.vence_corregido).slice(0, 10) }),
          MOTIVO,
        ],
      );

      await c.query(
        `UPDATE suscripciones
         SET "fechaVencimiento" = $1,
             "enPeriodoGracia"  = false,
             "fechaFinGracia"   = NULL,
             "updatedAt"        = NOW()
         WHERE id = $2`,
        [String(r.vence_corregido).slice(0, 10), r.suscripcion_id],
      );
    }

    // Cómo queda, leído DENTRO de la transacción.
    const despues = await c.query(
      `SELECT s."empresaId" AS empresa,
              to_char(s."fechaVencimiento",'YYYY-MM-DD') AS vence,
              s."enPeriodoGracia" AS en_gracia
       FROM suscripciones s
       WHERE s.id = ANY($1::int[])
       ORDER BY s."empresaId"`,
      [pendientes.rows.map(r => r.suscripcion_id)],
    );
    console.log('=== Cómo queda ===');
    console.table(despues.rows);

    if (CONFIRMAR) {
      await c.query('COMMIT');
      console.log('COMMIT — ' + pendientes.rows.length + ' suscripción(es) corregida(s), con su registro en suscripcion_auditoria.');
    } else {
      await c.query('ROLLBACK');
      console.log('ROLLBACK — no se escribió nada.');
      console.log('Para aplicarlo:  node scripts/fix-vencimiento-renovacion-pagada.js --confirmar');
    }
  } catch (err) {
    await c.query('ROLLBACK').catch(() => null);
    throw err;
  } finally {
    await c.end();
  }
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
