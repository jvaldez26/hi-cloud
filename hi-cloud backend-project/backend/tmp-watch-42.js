// Vigila las facturas POS nuevas de las empresas SIN control de caja (42 y 64).
// Una linea por factura: con vendedor = Fase 2 funcionando; sin = sigue el sangrado.
// Temporal — borrar cuando termine la verificacion.
require('dotenv').config();
const { Client } = require('pg');
const DEPLOY = '2026-08-26 00:02:52';   // fin del Deploy de Fase 2 (UTC)
let ultimo = 0;
(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT||5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false });
  await c.connect();
  console.log('vigilando empresas 42 y 64 desde el deploy...');
  for (;;) {
    try {
      const r = await c.query(`
        SELECT f.id, f.folio, f."empresaId", f."vendedorId", f."nombreVendedor",
               to_char(f."createdAt" - interval '4 hours','HH24:MI:SS') AS hora
        FROM facturas f
        WHERE f."empresaId" IN (42,64) AND f."isActive"=true AND f.notas LIKE 'POS%'
          AND f."createdAt" > TIMESTAMP '${DEPLOY}' AND f.id > $1
        ORDER BY f.id`, [ultimo]);
      for (const f of r.rows) {
        ultimo = Math.max(ultimo, f.id);
        console.log(f.vendedorId
          ? `OK empresa ${f.empresaId} ${f.folio} (${f.hora} RD) -> vendedor ${f.vendedorId} ${f.nombreVendedor||''} — Fase 2 FUNCIONA`
          : `HUERFANA empresa ${f.empresaId} ${f.folio} (${f.hora} RD) -> vendedorId NULL — SIGUE EL SANGRADO`);
      }
    } catch (e) { console.log('ERROR consulta: ' + e.message); }
    await new Promise(r => setTimeout(r, 60000));
  }
})().catch(e => { console.log('ERROR fatal: ' + e.message); process.exit(1); });
