#!/usr/bin/env node
/**
 * check-tenant-empresaid-filter.js
 *
 * P0 (2026-09-21) — periodo-contable.service.ts#cerrar() calculaba sus
 * totales con un QueryBuilder + getRawOne() sin empresaId: sumaba asientos
 * de TODAS las empresas. getRawOne()/getRawMany() devuelven una fila cruda,
 * no una entidad hidratada — ni TenantAwareRepository (que hay que activar
 * a mano con tenantService.wrap()/qb()) ni TenantSubscriber.afterLoad()
 * (que solo revisa entidades hidratadas por find/findOne/getMany) pueden
 * atraparlo. Lo mismo aplica a dataSource.query()/manager.query() con SQL
 * crudo: no pasan por ninguna capa automática.
 *
 * Este check detecta la FORMA del bug (no ese caso puntual, ya corregido):
 * un QueryBuilder que termina en .getRawOne()/.getRawMany(), o una consulta
 * SQL cruda, sobre una de las tablas multi-tenant vigiladas, SIN que
 * "empresaId" aparezca en ningún punto de esa misma consulta.
 *
 * ALCANCE — empieza por las 4 tablas contables (REGLA HACIA ADELANTE, sin
 * refactor masivo del resto del backend):
 *   cuentas_contables · asientos_contables · asiento_lineas · productos
 *
 * Es heurístico — igual que check-raw-sql-tables.js, del que reutiliza la
 * extracción de literales SQL: no entiende JOINs donde el filtro de empresa
 * viaja por una tabla distinta a la vigilada, ni casos donde empresaId SÍ
 * está filtrado pero con otro nombre de columna. Por eso hay BASELINE: los
 * sitios que ya existían (documentados en la auditoría del 2026-09-21, la
 * mayoría de riesgo bajo — ver el commit) quedan grandfathered para que este
 * check entre en verde y bloquee SOLO lo nuevo.
 *   node scripts/check-tenant-empresaid-filter.js --actualizar-baseline
 *
 * Uso:
 *   node scripts/check-tenant-empresaid-filter.js
 *   node scripts/check-tenant-empresaid-filter.js --todos             (ignora baseline)
 *   node scripts/check-tenant-empresaid-filter.js --actualizar-baseline
 *
 * Exit code: 0 sin hallazgos nuevos: 1 si hay al menos uno nuevo.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const RAIZ_SRC       = path.join(__dirname, '..', 'src');
const BASELINE_FILE  = path.join(__dirname, 'baseline-tenant-empresaid-filter.json');
const MINIMO_ARCHIVOS = 200;

const ACTUALIZAR_BASELINE = process.argv.includes('--actualizar-baseline');
const IGNORAR_BASELINE    = process.argv.includes('--todos');
const AUTOTEST            = process.argv.includes('--autotest');

// tabla SQL → clase de entidad TypeORM (para reconocer repo.createQueryBuilder())
const TABLAS_VIGILADAS = {
  cuentas_contables:  'CuentaContable',
  asientos_contables: 'AsientoContable',
  asiento_lineas:     'AsientoLinea',
  productos:          'Producto',
};

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'migrations') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

function lineaDe(src, index) {
  return src.slice(0, index).split('\n').length;
}

// ── 1. QueryBuilder → getRawOne()/getRawMany() sin empresaId ──────────────────
//
// Mapea cada campo `@InjectRepository(Entidad) ... campo: Repository<Entidad>`
// de la clase, y busca `campo.createQueryBuilder(` ... `.getRawOne(`|
// `.getRawMany(` dentro de una ventana razonable (una cadena encadenada de
// verdad nunca es más larga que esto) — si "empresaId" no aparece en el
// tramo, es un hit.
const RE_INJECT_REPO = /@InjectRepository\((\w+)\)[\s\S]{0,80}?(?:private|public|protected)?\s*(?:readonly\s+)?(\w+)\s*:\s*Repository</g;
const VENTANA_MAX = 3000; // caracteres — generoso para una cadena encadenada real

function chequearQueryBuilders(file, src, hits) {
  const camposPorEntidad = new Map(); // entidad → Set<nombreCampo>
  for (const m of src.matchAll(RE_INJECT_REPO)) {
    const [, entidad, campo] = m;
    if (!Object.values(TABLAS_VIGILADAS).includes(entidad)) continue;
    if (!camposPorEntidad.has(entidad)) camposPorEntidad.set(entidad, new Set());
    camposPorEntidad.get(entidad).add(campo);
  }
  if (camposPorEntidad.size === 0) return;

  const camposVigilados = new Set([...camposPorEntidad.values()].flatMap(s => [...s]));

  for (const campo of camposVigilados) {
    const re = new RegExp(`\\b${campo}\\.createQueryBuilder\\(`, 'g');
    for (const m of src.matchAll(re)) {
      const inicio  = m.index;
      const ventana = src.slice(inicio, inicio + VENTANA_MAX);
      const idxRaw  = ventana.search(/\.getRaw(One|Many)\(/);
      if (idxRaw === -1) continue; // no termina en getRawOne/getRawMany — find/getMany sí pasa por el subscriber

      const tramo = ventana.slice(0, idxRaw);
      if (/empresaId/.test(tramo)) continue; // filtrado — ok

      hits.push({ file, line: lineaDe(src, inicio), motivo: `${campo}.createQueryBuilder(...).getRaw${ventana[idxRaw + 8] === 'O' ? 'One' : 'Many'}() sin empresaId en la cadena` });
    }
  }
}

// ── 2. SQL crudo sobre una tabla vigilada sin empresaId ────────────────────────
//
// Reutiliza la misma extracción de literales SQL que check-raw-sql-tables.js.
const RE_STRING_LITERAL = /`([^`]*)`|'((?:[^'\\]|\\.)*)'/g;
const RE_ES_SQL         = /^\s*(SELECT|UPDATE|INSERT|DELETE|WITH)/i;
const RE_TABLA_VIGILADA = new RegExp(
  `\\b(FROM|JOIN|UPDATE|INTO)\\s+"?(${Object.keys(TABLAS_VIGILADAS).join('|')})"?\\b`, 'gi',
);

function chequearSqlCrudo(file, src, hits) {
  for (const lit of src.matchAll(RE_STRING_LITERAL)) {
    const texto = lit[1] ?? lit[2] ?? '';
    if (!RE_ES_SQL.test(texto)) continue;
    const tablaMatch = [...texto.matchAll(RE_TABLA_VIGILADA)][0];
    if (!tablaMatch) continue;
    if (/empresaId/.test(texto)) continue; // filtrado en algún punto de la misma consulta — ok

    hits.push({ file, line: lineaDe(src, lit.index), motivo: `SQL crudo sobre "${tablaMatch[2]}" sin empresaId en la misma consulta` });
  }
}

// ── Autotest — el verificador se prueba a sí mismo primero ────────────────────
// (mismo principio que validate-update-returning.js: un verificador que no se
// comprueba a sí mismo puede llevar meses en verde sin mirar nada).

function autotest() {
  const casos = [
    {
      nombre: 'DEBE marcar — createQueryBuilder + getRawOne sin empresaId',
      src: `
        @InjectRepository(AsientoContable) private asientoRepo: Repository<AsientoContable>;
        async cerrar() {
          const raw = await this.asientoRepo.createQueryBuilder('a')
            .select('SUM(a.totalDebe)', 'total')
            .where('a.fecha >= :inicio', { inicio })
            .getRawOne();
        }`,
      esperaHit: true,
    },
    {
      nombre: 'NO debe marcar — createQueryBuilder + getRawOne CON empresaId',
      src: `
        @InjectRepository(AsientoContable) private asientoRepo: Repository<AsientoContable>;
        async cerrar() {
          const raw = await this.asientoRepo.createQueryBuilder('a')
            .where('a.empresaId = :eid', { eid })
            .getRawOne();
        }`,
      esperaHit: false,
    },
    {
      nombre: 'NO debe marcar — createQueryBuilder + getMany (sí pasa por el subscriber)',
      src: `
        @InjectRepository(AsientoContable) private asientoRepo: Repository<AsientoContable>;
        async listar() {
          return this.asientoRepo.createQueryBuilder('a').where('a.id = :id', { id }).getMany();
        }`,
      esperaHit: false,
    },
    {
      nombre: 'DEBE marcar — SQL crudo sobre asientos_contables sin empresaId',
      src: `
        async cerrar() {
          await this.dataSource.query(\`SELECT SUM("totalDebe") FROM asientos_contables WHERE fecha >= $1\`, [f]);
        }`,
      esperaHit: true,
    },
    {
      nombre: 'NO debe marcar — SQL crudo sobre asientos_contables CON empresaId',
      src: `
        async cerrar() {
          await this.dataSource.query(\`SELECT SUM("totalDebe") FROM asientos_contables WHERE "empresaId" = $1\`, [eid]);
        }`,
      esperaHit: false,
    },
    {
      nombre: 'NO debe marcar — SQL crudo sobre una tabla no vigilada',
      src: `
        async listar() {
          await this.dataSource.query(\`SELECT * FROM users WHERE id = $1\`, [id]);
        }`,
      esperaHit: false,
    },
  ];

  let ok = true;
  console.log('\n  Autotest del verificador:\n');
  for (const caso of casos) {
    const hits = [];
    chequearQueryBuilders('fixture.ts', caso.src, hits);
    chequearSqlCrudo('fixture.ts', caso.src, hits);
    const paso = (hits.length > 0) === caso.esperaHit;
    console.log(`    ${paso ? '\x1b[32mOK\x1b[0m' : '\x1b[31mFALLA\x1b[0m'}   ${caso.esperaHit ? 'DEBE marcar' : 'NO debe marcar'}  — ${caso.nombre}`);
    if (!paso) ok = false;
  }
  if (!ok) {
    console.log('\n❌ Autotest FALLÓ — el verificador no detecta lo que dice detectar. No confiar en su resultado hasta arreglarlo.');
    process.exit(1);
  }
  console.log('\n✅ Autotest OK — marca los casos sin empresaId y deja pasar los filtrados / no vigilados.\n');
}

if (AUTOTEST) {
  autotest();
  process.exit(0);
}

// ── Recolección ─────────────────────────────────────────────────────────────

const archivos = walk(RAIZ_SRC);
if (archivos.length < MINIMO_ARCHIVOS) {
  console.error(`❌ Solo se encontraron ${archivos.length} archivo(s) .ts — el árbol escaneado no parece correcto. Abortando.`);
  process.exit(1);
}

const hits = [];
for (const file of archivos) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  chequearQueryBuilders(rel, src, hits);
  chequearSqlCrudo(rel, src, hits);
}

const claves = hits.map(h => `${h.file}:${h.line}`);

// ── Baseline ──────────────────────────────────────────────────────────────────

if (ACTUALIZAR_BASELINE) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify([...new Set(claves)].sort(), null, 2) + '\n');
  console.log(`✅ Baseline actualizado: ${claves.length} sitio(s) grandfathered en ${path.basename(BASELINE_FILE)}`);
  process.exit(0);
}

let baseline = new Set();
if (!IGNORAR_BASELINE && fs.existsSync(BASELINE_FILE)) {
  baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')));
}

const nuevos = hits.filter((h, i) => !baseline.has(claves[i]));

if (nuevos.length === 0) {
  console.log(`✅ Sin consultas nuevas sin empresaId sobre las 4 tablas vigiladas (${hits.length} en baseline, revisar aparte)`);
  process.exit(0);
}

console.log(`❌ ${nuevos.length} consulta(s) NUEVA(s) sobre cuentas_contables/asientos_contables/asiento_lineas/productos sin empresaId:\n`);
for (const h of nuevos) {
  console.log(`   ${h.file}:${h.line} — ${h.motivo}`);
}
console.log('\n   Si es intencional (ya filtrado por otra vía que este check no reconoce), agrégalo al baseline:');
console.log('     node scripts/check-tenant-empresaid-filter.js --actualizar-baseline');
console.log('   Si no, agrega el filtro de empresaId a esa consulta antes de continuar.');

process.exit(1);
