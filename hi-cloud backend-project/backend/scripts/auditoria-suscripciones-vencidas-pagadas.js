#!/usr/bin/env node
/**
 * Auditoría: suscripciones que aparecen vencidas o con saldo, pero ya pagaron.
 *
 * Nace del caso ELIDO (empresa 73): cargo de renovación del ciclo 05/10→05/11
 * por RD$7,600 + cargo e-CF RD$2,400, pago manual confirmado de RD$10,000.
 * Saldo real 0, y la pantalla seguía diciendo "Vencida hace 4 días. Tu último
 * pago cubrió hasta 05/10/2026".
 *
 * El pago liquidaba el cargo de renovación pero NO movía fechaVencimiento: la
 * imputación solo avanzaba períodos con el remanente DESPUÉS de los cargos, y
 * el cargo de renovación se comía justo ese remanente. Corregido en 3b879964;
 * esto encuentra las filas que quedaron mal mientras el bug vivió.
 *
 * SOLO LECTURA, y no por convención: abre la sesión con
 * default_transaction_read_only = on y comprueba con SHOW que quedó en 'on'
 * antes de consultar nada. Si no lo está, sale sin tocar la base — así
 * Postgres rechaza cualquier escritura aunque este archivo se edite mañana.
 *
 *   node scripts/auditoria-suscripciones-vencidas-pagadas.js
 *   node scripts/auditoria-suscripciones-vencidas-pagadas.js --empresa=73
 *
 * Credenciales: .env.prod.bak (o --env=ruta\al\archivo).
 */
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

// ── Credenciales ────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const argEnv  = (args.find(a => a.startsWith('--env=')) || '').split('=')[1];
const empresa = Number((args.find(a => a.startsWith('--empresa=')) || '').split('=')[1]) || null;

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
  console.error('Pásalo a mano:  node scripts/auditoria-suscripciones-vencidas-pagadas.js --env=C:\\ruta\\.env.prod.bak');
  process.exit(1);
}
require('dotenv').config({ path: envPath });
console.log('Credenciales: ' + envPath);

const cliente = () => new Client({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// ── Consultas ───────────────────────────────────────────────────────────────

/** Saldo real — misma cuenta que PagosSuscripcionService.getSaldoPendiente(). */
const SALDO = `
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
`;

/** Ciclos liquidados del todo: el cargo de renovación ya está pagado. */
const CICLOS_PAGADOS = `
  SELECT "empresaId", MAX("periodoFin"::date) AS ultimo_ciclo_pagado
  FROM pagos_suscripcion
  WHERE tipo = 'CARGO' AND estado != 'RECHAZADO'
    AND "periodoFin" IS NOT NULL
    AND monto <= "montoPagado"
  GROUP BY "empresaId"
`;

const SECCIONES = [
  {
    titulo: '1. Saldo real 0 o a favor, pero la pantalla las da por vencidas',
    sql: `
      WITH saldo AS (${SALDO})
      SELECT e.id AS empresa, e.nombre, s.plan,
             s.estado AS estado_suscripcion,
             COALESCE(sa.saldo_real, 0) AS saldo_real,
             to_char(s."fechaVencimiento",'YYYY-MM-DD') AS vence,
             (CURRENT_DATE - s."fechaVencimiento"::date) AS dias_vencida,
             s."enPeriodoGracia" AS en_gracia
      FROM suscripciones s
      JOIN empresa e     ON e.id = s."empresaId"
      LEFT JOIN saldo sa ON sa."empresaId" = s."empresaId"
      WHERE e."isActive" = true
        AND s."fechaVencimiento"::date < CURRENT_DATE
        AND COALESCE(sa.saldo_real, 0) <= 0
      ORDER BY dias_vencida DESC, e.id
    `,
  },
  {
    titulo: '2. Pagaron el ciclo y la fecha no avanzó (esto es lo que corrige el fix)',
    sql: `
      WITH cp AS (${CICLOS_PAGADOS}), saldo AS (${SALDO})
      SELECT e.id AS empresa, e.nombre, s.plan,
             s.estado AS estado_suscripcion,
             COALESCE(sa.saldo_real, 0) AS saldo_real,
             to_char(s."fechaVencimiento",'YYYY-MM-DD')   AS vence_ahora,
             to_char(cp.ultimo_ciclo_pagado,'YYYY-MM-DD') AS deberia_vencer,
             (cp.ultimo_ciclo_pagado - s."fechaVencimiento"::date) AS dias_sin_acreditar
      FROM suscripciones s
      JOIN empresa e     ON e.id = s."empresaId"
      JOIN cp            ON cp."empresaId" = s."empresaId"
      LEFT JOIN saldo sa ON sa."empresaId" = s."empresaId"
      WHERE e."isActive" = true
        AND cp.ultimo_ciclo_pagado > s."fechaVencimiento"::date
      ORDER BY dias_sin_acreditar DESC, e.id
    `,
  },
  {
    titulo: '3. Cargos de renovación de períodos ya vencidos',
    sql: `
      SELECT p."empresaId" AS empresa, e.nombre, p.concepto,
             p.monto, p."montoPagado",
             to_char(p."periodoInicio",'YYYY-MM-DD') AS ciclo_inicio,
             to_char(p."periodoFin",'YYYY-MM-DD')    AS ciclo_fin,
             CASE WHEN p.monto <= p."montoPagado" THEN 'liquidado' ELSE 'pendiente' END AS estado_cargo
      FROM pagos_suscripcion p
      JOIN empresa e       ON e.id = p."empresaId"
      JOIN suscripciones s ON s."empresaId" = p."empresaId"
      WHERE p.tipo = 'CARGO' AND p.estado != 'RECHAZADO'
        AND p."periodoInicio" IS NOT NULL
        AND p."periodoInicio"::date >= s."fechaVencimiento"::date
        AND e."isActive" = true
      ORDER BY p."empresaId", p."periodoInicio"
    `,
  },
];

const DETALLE_EMPRESA = `
  SELECT id, tipo, estado, concepto, monto, "montoPagado",
         to_char("periodoInicio",'YYYY-MM-DD') AS ciclo_inicio,
         to_char("periodoFin",'YYYY-MM-DD')    AS ciclo_fin,
         to_char("creadoEn",'YYYY-MM-DD HH24:MI')     AS creado,
         to_char("confirmadoEn",'YYYY-MM-DD HH24:MI') AS confirmado
  FROM pagos_suscripcion
  WHERE "empresaId" = $1
  ORDER BY "creadoEn"
`;

(async () => {
  const c = cliente();
  await c.connect();

  // ── Candado de solo lectura ───────────────────────────────────────────────
  // No es decorativo: con esto puesto, Postgres rechaza cualquier INSERT o
  // UPDATE que se cuele en este archivo, hoy o dentro de un año.
  await c.query('SET SESSION default_transaction_read_only = on');
  const modo = await c.query('SHOW default_transaction_read_only');
  const valor = modo.rows[0].default_transaction_read_only;
  console.log('default_transaction_read_only = ' + valor);
  if (valor !== 'on') {
    console.error('');
    console.error('ABORTADO: la sesión NO quedó en solo lectura. No se consulta nada.');
    await c.end();
    process.exit(1);
  }
  console.log('');

  let totalFilas = 0;
  for (const s of SECCIONES) {
    const r = await c.query(s.sql);
    console.log('=== ' + s.titulo + ' ===');
    if (r.rows.length === 0) {
      console.log('  (ninguna)');
      console.log('');
    } else {
      console.table(r.rows);
      totalFilas += r.rows.length;
    }
  }

  if (empresa) {
    const r = await c.query(DETALLE_EMPRESA, [empresa]);
    console.log('=== 4. Detalle de la empresa ' + empresa + ' ===');
    if (r.rows.length === 0) {
      console.log('  (sin movimientos)');
      console.log('');
    } else {
      console.table(r.rows);
    }
  } else {
    console.log('Para ver el detalle de una empresa:  --empresa=73');
    console.log('');
  }

  await c.end();
  console.log(totalFilas === 0
    ? 'Nada que corregir.'
    : totalFilas + ' fila(s) para revisar. La corrección: node scripts/fix-vencimiento-renovacion-pagada.js');
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
