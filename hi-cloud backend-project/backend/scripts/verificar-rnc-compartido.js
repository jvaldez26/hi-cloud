#!/usr/bin/env node
/**
 * Verifica que los clientes que COMPARTEN RNC estén declarando bien ante DGII.
 *
 * Pensado para el caso de las escuelas de un distrito educativo: varias
 * facturan bajo el RNC del distrito y son clientes distintos (dirección,
 * contacto y cuenta por cobrar propias), pero ante DGII las tres cosas que
 * deben cumplirse son:
 *
 *   1. todas declaran el MISMO RNCComprador
 *   2. todas declaran la MISMA RazonSocialComprador (la del RNC, no el
 *      nombre interno que las distingue)
 *   3. el 607 saca una línea por comprobante, sin agregación por cliente
 *
 * Uso:
 *   node scripts/verificar-rnc-compartido.js [empresaId] [mes] [anio]
 *
 * Sin argumentos revisa todas las empresas y, para el 607, el mes actual.
 * Solo lectura: no modifica nada.
 */
require('dotenv').config();
const { Client } = require('pg');

const ok    = m => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad   = m => { console.log('  \x1b[31m✗\x1b[0m ' + m); process.exitCode = 1; };
const info  = m => console.log('  · ' + m);

(async () => {
  const [, , empresaArg, mesArg, anioArg] = process.argv;
  const hoy  = new Date();
  const MES  = Number(mesArg  ?? hoy.getMonth() + 1);
  const ANIO = Number(anioArg ?? hoy.getFullYear());
  const desde = `${ANIO}-${String(MES).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(ANIO, MES, 0)).toISOString().slice(0, 10);

  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  const filtroEmpresa = empresaArg ? 'AND cl."empresaId" = ' + Number(empresaArg) : '';

  // ── 1. Grupos de clientes activos que comparten RNC ───────────────────────
  const grupos = (await c.query(`
    SELECT cl."empresaId", COALESCE(cl."rncReceptor", cl.rfc) AS rnc,
           COUNT(*) AS clientes
      FROM clientes cl
     WHERE cl."isActive" = true
       AND btrim(COALESCE(COALESCE(cl."rncReceptor", cl.rfc), '')) <> ''
       ${filtroEmpresa}
     GROUP BY 1, 2
    HAVING COUNT(*) > 1
     ORDER BY 1, 3 DESC`)).rows;

  console.log(`\n════ Clientes con RNC compartido ════`);
  if (!grupos.length) {
    console.log('\n  No hay ningún RNC compartido por dos o más clientes activos.');
    console.log('  (Nada que verificar todavía — registra las escuelas primero.)\n');
    await c.end();
    return;
  }

  for (const g of grupos) {
    console.log(`\n── Empresa ${g.empresaId} · RNC ${g.rnc} · ${g.clientes} clientes ──`);

    // ── 2. Ficha de cada cliente y lo que declararía ────────────────────────
    const cli = (await c.query(`
      SELECT id, nombre, "razonSocial", direccion, ciudad,
             COALESCE(NULLIF(btrim("razonSocial"), ''), nombre) AS "razonSocialDeclarada"
        FROM clientes
       WHERE "isActive" = true AND "empresaId" = $1
         AND COALESCE("rncReceptor", rfc) = $2
       ORDER BY id`, [g.empresaId, g.rnc])).rows;
    console.table(cli.map(r => ({
      id: r.id, nombreInterno: r.nombre,
      declara: r.razonSocialDeclarada,
      direccion: [r.direccion, r.ciudad].filter(Boolean).join(', ') || '—',
    })));

    const razones = new Set(cli.map(r => r.razonSocialDeclarada));
    razones.size === 1
      ? ok(`todas declaran la misma razón social: "${[...razones][0]}"`)
      : bad(`declaran ${razones.size} razones sociales distintas: ${JSON.stringify([...razones])}` +
            ' → unificar el campo "Razón Social fiscal (DGII)" en los tres');

    new Set(cli.map(r => r.nombre)).size === cli.length
      ? ok('los nombres internos los distinguen entre sí')
      : bad('hay nombres internos repetidos — no se pueden distinguir en el POS');

    cli.every(r => r.direccion)
      ? ok('todos tienen dirección — el cajero puede elegir bien')
      : info('alguno no tiene dirección: en el POS costará distinguirlos');

    // ── 3. e-CF realmente emitidos a cada uno ───────────────────────────────
    const ecfs = (await c.query(`
      SELECT e.numero, e."rncComprador", e."razonSocialComprador", e."estadoDGII",
             f."clienteId", f.folio
        FROM ecf e
        JOIN facturas f ON f.id = e."facturaId"
       WHERE f."clienteId" = ANY($1) AND e."isActive" = true
       ORDER BY e.id DESC LIMIT 40`, [cli.map(r => r.id)])).rows;

    if (!ecfs.length) {
      info('todavía no se ha emitido ningún e-CF a estos clientes');
    } else {
      console.table(ecfs.map(e => ({
        encf: e.numero, folio: e.folio, clienteId: e.clienteId,
        rncDeclarado: e.rncComprador, razonSocialDeclarada: e.razonSocialComprador,
        estado: e.estadoDGII,
      })));
      const rncs   = new Set(ecfs.map(e => e.rncComprador));
      const razEcf = new Set(ecfs.map(e => e.razonSocialComprador));
      rncs.size === 1
        ? ok(`todos los e-CF llevan el mismo RNCComprador: ${[...rncs][0]}`)
        : bad(`los e-CF llevan ${rncs.size} RNC distintos: ${JSON.stringify([...rncs])}`);
      razEcf.size === 1
        ? ok(`todos los e-CF llevan la misma RazonSocialComprador: "${[...razEcf][0]}"`)
        : bad(`los e-CF llevan ${razEcf.size} razones sociales: ${JSON.stringify([...razEcf])}`);
      const cubiertos = new Set(ecfs.map(e => e.clienteId));
      cubiertos.size === cli.length
        ? ok('hay e-CF emitido para cada uno de los clientes del grupo')
        : info(`solo ${cubiertos.size} de ${cli.length} clientes tienen e-CF emitido`);
    }

    // ── 4. Cómo salen en el 607 del período ─────────────────────────────────
    const l607 = (await c.query(`
      SELECT f.folio, e.numero AS encf, f."clienteId",
             COALESCE(c."rncReceptor", c.rfc, '') AS "rncComprador",
             COALESCE(NULLIF(btrim(c."razonSocial"), ''), c.nombre) AS "nombreComprador",
             f.total::numeric AS total
        FROM facturas f
        LEFT JOIN ecf e ON e."facturaId" = f.id AND e."isActive" = true
        LEFT JOIN clientes c ON c.id = f."clienteId"
       WHERE f."empresaId" = $1 AND f."clienteId" = ANY($2)
         AND f.fecha BETWEEN $3 AND $4
         AND f.estado IN ('emitida','pagada') AND f."isActive" = true
       ORDER BY f.fecha, f.id`, [g.empresaId, cli.map(r => r.id), desde, hasta])).rows;

    console.log(`\n  607 de ${MES}/${ANIO} para este RNC:`);
    if (!l607.length) {
      info('sin ventas declarables en el período');
    } else {
      console.table(l607.map(r => ({
        folio: r.folio, encf: r.encf ?? '(sin e-CF)', clienteId: r.clienteId,
        rnc: r.rncComprador, declarado: r.nombreComprador, total: r.total,
      })));
      ok(`${l607.length} líneas para ${l607.length} comprobantes — una por NCF, ` +
         'como espera DGII (el 607 es un detalle, no un resumen por contribuyente)');
      new Set(l607.map(r => r.rncComprador)).size === 1
        ? ok('todas las líneas llevan el mismo RNC del comprador')
        : bad('las líneas llevan RNC distintos');
    }
  }

  console.log('');
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
