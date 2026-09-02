#!/usr/bin/env node
/**
 * Cuántos e-CF consumió cada empresa contra el cupo de su plan.
 *
 * El período es el CICLO DE FACTURACIÓN de la empresa (`suscripciones."diaCorte"`),
 * no el mes calendario. Una empresa con corte el día 5 mide del 5 al 4, que es
 * el período que se le cobra. Medirla del 1 al 31 daría un número que no
 * corresponde a ninguna factura.
 *
 * El día se ancla igual que en `preview-pago.util.ts`: un corte 31 pasa por
 * abril como 30 y vuelve a 31 en mayo, en vez de degradarse para siempre.
 * Misma regla, para que este script y el panel de cobros nunca discrepen.
 *
 * QUÉ CUENTA: toda fila de `ecf`. La fila se inserta dentro de la misma
 * transacción que incrementa la secuencia, así que una fila es exactamente una
 * secuencia consumida — emitida, la acepte DGII o la rechace. No se filtra por
 * estado a propósito: un rechazado quemó secuencia y cuota de MSeller igual.
 *
 * Uso:
 *   node scripts/medir-consumo-ecf.js                  ciclo en curso, todas
 *   node scripts/medir-consumo-ecf.js --ciclos 6       últimos 6 ciclos
 *   node scripts/medir-consumo-ecf.js --empresa 44     una sola empresa
 *   node scripts/medir-consumo-ecf.js --precio 3       simula el cargo a RD$3
 *   node scripts/medir-consumo-ecf.js --csv            salida para pegar en hoja
 *
 * Solo lectura: no modifica nada.
 */
require('dotenv').config();
const { Client } = require('pg');

// ── Cupos por plan ──────────────────────────────────────────────────────────
// Espejo de PLANES en src/suscripciones/entities/suscripcion.entity.ts. Cuando
// el cupo se mueva allí, se mueve aquí — este script se ejecuta a mano y no
// puede importar el módulo compilado sin arrastrar medio Nest.
const CUPO = {
  emprendedor: 500,
  pyme:       1000,
  pro:        2500,
  plus:       6000,
  // Legado: se mantienen para que una empresa vieja no salga sin cupo.
  basico:      500,
  profesional:1000,
  empresarial:2500,
  enterprise: 6000,
  trial:       500,
};

// ── Argumentos ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { ciclos: 1, empresa: null, precio: null, csv: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--ciclos')  a.ciclos  = Math.max(1, Number(argv[++i]) || 1);
    else if (v === '--empresa') a.empresa = Number(argv[++i]) || null;
    else if (v === '--precio')  a.precio  = Number(argv[++i]) || null;
    else if (v === '--csv')     a.csv     = true;
    else if (v === '--help' || v === '-h') { a.help = true; }
  }
  return a;
}

// ── Ciclos ──────────────────────────────────────────────────────────────────

/** Día real del corte en un mes concreto: 31 en abril es 30. */
function diaAnclado(anio, mes /* 1-12 */, diaCorte) {
  const ultimoDia = new Date(anio, mes, 0).getDate();
  return Math.min(Math.max(1, diaCorte || 1), ultimoDia);
}

function iso(anio, mes, dia) {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Los últimos `n` ciclos de una empresa, del más reciente al más antiguo.
 * Devuelve { desde, hasta } con `hasta` EXCLUSIVO — así el límite entre dos
 * ciclos no cuenta dos veces el mismo comprobante.
 */
function ciclosDe(diaCorte, n, hoy = new Date()) {
  const anio = hoy.getFullYear();
  const mes  = hoy.getMonth() + 1;
  const dia  = hoy.getDate();

  // Inicio del ciclo en curso: el corte de este mes si ya pasó, si no el del anterior.
  let ay = anio, am = mes;
  if (dia < diaAnclado(anio, mes, diaCorte)) {
    am -= 1;
    if (am === 0) { am = 12; ay -= 1; }
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const desdeY = ay, desdeM = am;
    let hastaY = ay, hastaM = am + 1;
    if (hastaM === 13) { hastaM = 1; hastaY += 1; }

    out.push({
      desde: iso(desdeY, desdeM, diaAnclado(desdeY, desdeM, diaCorte)),
      hasta: iso(hastaY, hastaM, diaAnclado(hastaY, hastaM, diaCorte)),
    });

    am -= 1;
    if (am === 0) { am = 12; ay -= 1; }
  }
  return out;
}

// ── Salida ──────────────────────────────────────────────────────────────────
const money = n => 'RD$' + Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function pintarCsv(filas) {
  console.log('empresaId,empresa,plan,cicloDesde,cicloHasta,emitidos,cupo,pct,excedente,cargo');
  for (const f of filas) {
    console.log([
      f.empresaId, `"${(f.empresa || '').replace(/"/g, '""')}"`, f.plan,
      f.desde, f.hasta, f.emitidos, f.cupo ?? '', f.pct ?? '',
      f.excedente ?? '', f.cargo ?? '',
    ].join(','));
  }
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
    return;
  }

  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  // Empresas activas con suscripción. Se listan todas: una empresa que emite 0
  // en el ciclo también es información (dejó de facturar).
  const empresas = (await c.query(`
    SELECT e.id, e.nombre, s.plan, s.estado AS "estadoSuscripcion",
           COALESCE(s."diaCorte", 1) AS "diaCorte"
    FROM empresa e
    LEFT JOIN suscripciones s ON s."empresaId" = e.id
    WHERE e."isActive" = true ${args.empresa ? 'AND e.id = $1' : ''}
    ORDER BY e.id
  `, args.empresa ? [args.empresa] : [])).rows;

  const filas = [];
  for (const emp of empresas) {
    for (const ciclo of ciclosDe(Number(emp.diaCorte), args.ciclos)) {
      const [r] = (await c.query(`
        SELECT COUNT(*)::int AS emitidos
        FROM ecf
        WHERE "empresaId" = $1 AND "createdAt" >= $2::date AND "createdAt" < $3::date
      `, [emp.id, ciclo.desde, ciclo.hasta])).rows;

      const emitidos = Number(r?.emitidos ?? 0);
      if (emitidos === 0 && args.ciclos === 1) continue;  // no llenar la tabla de ceros

      const cupo      = CUPO[emp.plan] ?? null;
      const excedente = cupo ? Math.max(0, emitidos - cupo) : null;

      filas.push({
        empresaId: emp.id,
        empresa:   emp.nombre,
        plan:      emp.plan ?? '(sin plan)',
        estado:    emp.estadoSuscripcion,
        corte:     Number(emp.diaCorte),
        desde:     ciclo.desde,
        hasta:     ciclo.hasta,
        emitidos,
        cupo,
        pct:       cupo ? Math.round((emitidos / cupo) * 100) : null,
        excedente,
        cargo:     excedente != null && args.precio ? +(excedente * args.precio).toFixed(2) : null,
      });
    }
  }

  filas.sort((a, b) => b.desde.localeCompare(a.desde) || b.emitidos - a.emitidos);

  if (args.csv) { pintarCsv(filas); await c.end(); return; }

  if (filas.length === 0) {
    console.log('\n  Ninguna empresa emitió e-CF en el período consultado.\n');
    await c.end();
    return;
  }

  console.log(`\n  Consumo de e-CF por ciclo de facturación — ${args.ciclos} ciclo(s)`);
  if (args.precio) console.log(`  Precio del excedente simulado: ${money(args.precio)} por e-CF`);
  console.log();

  console.table(filas.map(f => ({
    id:        f.empresaId,
    empresa:   (f.empresa || '').slice(0, 26),
    plan:      f.plan,
    corte:     f.corte,
    ciclo:     `${f.desde} → ${f.hasta}`,
    emitidos:  f.emitidos,
    cupo:      f.cupo ?? '—',
    uso:       f.pct != null ? `${f.pct}%` : '—',
    // La marca es la del diseño: aviso al 80%, cargo desde el 100%.
    señal:     f.pct == null ? '' : f.pct >= 100 ? 'EXCEDIDA' : f.pct >= 80 ? 'aviso 80%' : '',
    excedente: f.excedente ?? '—',
    ...(args.precio ? { cargo: f.cargo != null ? money(f.cargo) : '—' } : {}),
  })));

  const pasadas = filas.filter(f => f.excedente > 0);
  const cerca   = filas.filter(f => f.excedente === 0 && f.pct >= 80);

  console.log(`\n  ${pasadas.length} ciclo(s) por encima del cupo, ${cerca.length} en zona de aviso (≥80%).`);
  if (args.precio && pasadas.length) {
    const total = pasadas.reduce((s, f) => s + (f.cargo ?? 0), 0);
    console.log(`  Cargo total que generarían: ${money(total)}`);
  }
  console.log();

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
