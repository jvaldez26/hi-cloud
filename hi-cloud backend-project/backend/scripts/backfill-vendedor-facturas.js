#!/usr/bin/env node
/**
 * Re-imputa el vendedor de las facturas POS que se grabaron con vendedorId NULL.
 *
 * El cierre de caja reúne las ventas por vendedorId + fecha. Una factura sin
 * vendedor no entra en ningún cuadre: así se quedaron RD$16.574,99 fuera de la
 * caja #446 de FERRETERIA PAVEL, 5 de las 16 facturas del turno de Yaribel.
 *
 * La re-imputación es exacta, no una heurística: facturas."usuarioId" siempre
 * está poblado, y vendedores."usuarioId" dice qué vendedor es ese usuario. Si el
 * usuario no tiene vendedor asociado la factura se deja como está — adivinar a
 * quién se le imputa una venta no es tarea de un script.
 *
 * Por defecto solo toca facturas del POS (notas LIKE 'POS%'). En el módulo de
 * facturación normal el vendedor vacío puede ser deliberado; para incluirlas hay
 * que pedirlo con --incluir-backoffice.
 *
 * Uso:
 *   node scripts/backfill-vendedor-facturas.js                  # simulación (no escribe)
 *   node scripts/backfill-vendedor-facturas.js --empresa 61     # acotado a una empresa
 *   node scripts/backfill-vendedor-facturas.js --aplicar        # escribe de verdad
 *   node scripts/backfill-vendedor-facturas.js --aplicar --incluir-backoffice
 *
 * Sin --aplicar no modifica nada: imprime el plan y sale.
 */
require('dotenv').config();
const { Client } = require('pg');

const APLICAR      = process.argv.includes('--aplicar');
const BACKOFFICE   = process.argv.includes('--incluir-backoffice');
const empresaArg   = (() => {
  const i = process.argv.indexOf('--empresa');
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

const ok   = m => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad  = m => { console.log('  \x1b[31m✗\x1b[0m ' + m); process.exitCode = 1; };
const info = m => console.log('  · ' + m);
const rd   = n => 'RD$' + Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 });

/**
 * Candidatas: factura sin vendedor cuyo usuario SÍ tiene vendedor asociado.
 * El filtro de estado es el mismo que usa recalcularDesdeBD() en caja.service.ts
 * — si el cuadre no la cuenta, re-imputarla no cambiaría nada.
 */
const SQL_CANDIDATAS = `
  SELECT f.id, f.folio, f."empresaId", f.fecha::date AS fecha, f.total,
         f."usuarioId", v.id AS "vendedorId", v.nombre AS "vendedorNombre"
    FROM facturas f
    JOIN LATERAL (
      SELECT v.id, v.nombre
        FROM vendedores v
       WHERE v."usuarioId" = f."usuarioId"
         AND v."empresaId" = f."empresaId"
         AND v."isActive"  = true
       ORDER BY v.activo DESC, v.id ASC
       LIMIT 1
    ) v ON true
   WHERE f."isActive"    = true
     AND f."vendedorId" IS NULL
     AND f.estado IN ('emitida','pagada')
     AND ($1::int IS NULL OR f."empresaId" = $1)
     AND ($2::bool OR f.notas LIKE 'POS%')
   ORDER BY f."empresaId", f.fecha, f.id`;

(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  console.log(`\nBackfill de vendedor en facturas — ${APLICAR ? '\x1b[33mAPLICANDO\x1b[0m' : 'SIMULACIÓN (no escribe)'}`);
  if (empresaArg) info(`acotado a la empresa ${empresaArg}`);
  if (BACKOFFICE) info('incluye facturas de backoffice, no solo POS');

  const { rows: candidatas } = await c.query(SQL_CANDIDATAS, [empresaArg, BACKOFFICE]);

  if (!candidatas.length) {
    ok('No hay facturas que re-imputar.');
    await c.end();
    return;
  }

  // ── Qué se va a tocar ────────────────────────────────────────────────────
  console.log('\n── Facturas a re-imputar ──');
  const porEmpresa = new Map();
  for (const f of candidatas) {
    const k = f.empresaId;
    if (!porEmpresa.has(k)) porEmpresa.set(k, { n: 0, monto: 0 });
    const acc = porEmpresa.get(k);
    acc.n += 1;
    acc.monto += Number(f.total);
  }
  for (const [empresaId, acc] of porEmpresa) {
    info(`empresa ${empresaId}: ${acc.n} factura(s), ${rd(acc.monto)}`);
  }
  console.table(candidatas.map(f => ({
    id: f.id, folio: f.folio, empresa: f.empresaId,
    fecha: String(f.fecha).slice(0, 10), total: f.total,
    usuario: f.usuarioId, '→ vendedor': `${f.vendedorId} (${f.vendedorNombre})`,
  })));

  // ── Cierres afectados ────────────────────────────────────────────────────
  //
  // Un cierre ABIERTO se recalcula solo la próxima vez que se consulte
  // (caja.service.recalcularDesdeBD). Uno CERRADO no: sus totales están
  // congelados en la fila y hay que decidir a mano si se reabre, porque son los
  // números contra los que alguien contó dinero físico.
  const { rows: cierres } = await c.query(`
    WITH cand AS (${SQL_CANDIDATAS})
    SELECT cc.id, cc.estado, cc.fecha::date AS fecha, cc."empresaId",
           cc."vendedorNombre", cc."cantidadTransacciones" AS conto,
           cc."ventasEfectivo", cc.diferencia,
           COUNT(cand.id)::int AS suma_facturas,
           SUM(cand.total)::numeric(12,2) AS suma_monto
      FROM cand
      JOIN cierres_caja cc ON cc."empresaId" = cand."empresaId"
                          AND cc.fecha       = cand.fecha
                          AND cc."vendedorId" = cand."vendedorId"
     GROUP BY cc.id, cc.estado, cc.fecha, cc."empresaId", cc."vendedorNombre",
              cc."cantidadTransacciones", cc."ventasEfectivo", cc.diferencia
     ORDER BY cc.fecha`, [empresaArg, BACKOFFICE]);

  console.log('\n── Cierres de caja afectados ──');
  if (!cierres.length) {
    info('ninguno');
  } else {
    console.table(cierres.map(cc => ({
      caja: cc.id, estado: cc.estado, fecha: String(cc.fecha).slice(0, 10),
      cajero: cc.vendedorNombre, 'contó': cc.conto,
      'suma +': cc.suma_facturas, 'RD$ +': cc.suma_monto,
      'diferencia registrada': cc.diferencia,
    })));
    const cerrados = cierres.filter(cc => cc.estado !== 'abierta');
    if (cerrados.length) {
      bad(`${cerrados.length} cierre(s) YA CERRADO(S) cambiarían de números: ` +
          cerrados.map(cc => `#${cc.id}`).join(', '));
      info('Un cierre cerrado no se recalcula solo. Decidir antes si se reabre:');
      info('sus totales son contra los que el cajero contó dinero físico.');
    }
    const abiertos = cierres.filter(cc => cc.estado === 'abierta');
    if (abiertos.length) {
      info(`${abiertos.length} cierre(s) abierto(s) se recalculan solos al consultarlos: ` +
           abiertos.map(cc => `#${cc.id}`).join(', '));
    }
  }

  // ── Comisiones ───────────────────────────────────────────────────────────
  //
  // comisiones.calcularPeriodo() agrupa por facturas."usuarioId" con JOIN a
  // users — nunca lee facturas."vendedorId" —, así que este backfill no las
  // altera. Se comprueba igualmente en vez de darlo por supuesto.
  const { rows: comis } = await c.query(`
    WITH cand AS (${SQL_CANDIDATAS})
    SELECT co.estado, COUNT(*)::int AS n
      FROM cand JOIN comisiones co ON co."facturaId" = cand.id
     GROUP BY 1`, [empresaArg, BACKOFFICE]);

  console.log('\n── Comisiones ──');
  if (!comis.length) {
    ok('ninguna comisión registrada sobre estas facturas');
  } else {
    console.table(comis);
    const pagadas = comis.find(x => x.estado === 'pagada');
    if (pagadas) bad(`${pagadas.n} comisión(es) YA PAGADAS sobre estas facturas — revisar antes de aplicar`);
  }

  // ── Aplicar ──────────────────────────────────────────────────────────────
  if (!APLICAR) {
    console.log('\n' + '─'.repeat(60));
    info('Simulación. Nada se ha modificado.');
    info('Para escribir: node scripts/backfill-vendedor-facturas.js --aplicar');
    await c.end();
    return;
  }

  console.log('\n── Aplicando ──');
  await c.query('BEGIN');
  try {
    // Una sola sentencia y con la misma guarda (vendedorId IS NULL): si otro
    // proceso ya imputó alguna, no se pisa.
    const { rowCount } = await c.query(`
      UPDATE facturas f
         SET "vendedorId"     = v.id,
             "nombreVendedor" = COALESCE(f."nombreVendedor", v.nombre)
        FROM vendedores v
       WHERE v."usuarioId" = f."usuarioId"
         AND v."empresaId" = f."empresaId"
         AND v."isActive"  = true
         AND f."isActive"  = true
         AND f."vendedorId" IS NULL
         AND f.estado IN ('emitida','pagada')
         AND ($1::int IS NULL OR f."empresaId" = $1)
         AND ($2::bool OR f.notas LIKE 'POS%')`,
      [empresaArg, BACKOFFICE]);

    await c.query('COMMIT');
    ok(`${rowCount} factura(s) re-imputadas.`);
    info('Los cierres abiertos se actualizan al abrir la pantalla de Caja Diaria.');
  } catch (e) {
    await c.query('ROLLBACK');
    bad('Error, nada se aplicó: ' + e.message);
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
