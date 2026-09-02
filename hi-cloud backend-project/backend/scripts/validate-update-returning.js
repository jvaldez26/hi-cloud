#!/usr/bin/env node
/**
 * validate-update-returning.js
 *
 * Impide que vuelva a escribirse una guarda rota sobre el resultado de un
 * UPDATE/DELETE hecho con `query()`.
 *
 * EL PROBLEMA
 *   TypeORM 0.3.31, PostgresQueryRunner.query(), mira `raw.command`:
 *
 *     UPDATE / DELETE          →  [rows, rowCount]   ← array de DOS, SIEMPRE
 *     INSERT / SELECT / WITH   →  rows               ← filas planas
 *
 *   Así que sobre un UPDATE/DELETE:
 *     · `resultado.length > 0`      vale SIEMPRE 2 > 0 → true, aunque no tocara
 *                                   ninguna fila.
 *     · `const [row] = resultado`   deja en `row` el ARRAY entero, no la fila,
 *                                   así que `row.id` es undefined.
 *
 *   Comprobado contra PostgreSQL: un UPDATE que no afecta nada devuelve
 *   literalmente `[[], 0]`.
 *
 * LO QUE COSTÓ (2026-09-02, el mismo día)
 *   · Los avisos de cuota de e-CF salieron 10 veces a cada admin de un cliente
 *     —40 correos— porque `filas.length > 0` daba siempre "ya reclamé el aviso".
 *   · La guarda de duplicado de facturas recurrentes no salía nunca. No llegó a
 *     duplicar, pero dos corridas simultáneas habrían declarado DOS comprobantes
 *     fiscales del mismo concepto a la DGII.
 *
 * LAS DOS FORMAS CORRECTAS
 *
 *   1) Envolver el UPDATE en un CTE y dejar arriba un SELECT, cuyo contrato de
 *      retorno sí es estable:
 *
 *        WITH reclamado AS (
 *          UPDATE t SET marca = now() WHERE id = $1 AND marca IS NULL RETURNING id
 *        )
 *        SELECT COUNT(*)::int AS n FROM reclamado
 *
 *      → `[{ n: 0 }]` o `[{ n: 1 }]`, y se lee `Number(r?.n ?? 0) > 0`.
 *
 *   2) Leer el segundo elemento, que ES el rowCount. Ya se usaba bien en
 *      `src/auth/token-blacklist.service.ts:40`, que es el ejemplo a copiar:
 *
 *        const result = await this.ds.query(`DELETE FROM token_blacklist ...`);
 *        this.logger.log(`... ${result?.[1] ?? 0} tokens eliminados`);
 *
 *   Y descartar el resultado sin leerlo (`await ds.query('UPDATE ...')` a secas)
 *   siempre está bien: no hay nada que malinterpretar.
 *
 * QUÉ FALLA
 *   Un UPDATE/DELETE vía `query()` cuyo resultado se consume con `.length` o
 *   desestructurando `[algo]`.
 *
 * BASELINE
 *   Los sitios que ya existían quedan en `baseline-update-returning.json` para
 *   que este verificador entre en verde y bloquee SOLO lo nuevo — que es el
 *   motivo de ponerlo antes del barrido: sin él se arreglan 90 sitios y el 91 se
 *   escribe igual la semana siguiente. Según el barrido los corrija, se van
 *   quitando del baseline con:
 *     node scripts/validate-update-returning.js --actualizar-baseline
 *
 * Uso:
 *   node scripts/validate-update-returning.js
 *   node scripts/validate-update-returning.js --todos           (ignora baseline)
 *   node scripts/validate-update-returning.js --actualizar-baseline
 *   node scripts/validate-update-returning.js --autotest        (se prueba a sí mismo)
 *
 * Exit code:
 *   0 — sin hallazgos nuevos
 *   1 — hay al menos uno nuevo, o el árbol escaneado no tiene sentido
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const RAIZ_SRC      = path.join(__dirname, '..', 'src');
const BASELINE_FILE = path.join(__dirname, 'baseline-update-returning.json');

// Un árbol sano tiene muchos más .ts que esto. Si el escáner apunta a un
// directorio vacío o equivocado, pasa en verde sin haber mirado nada — que es
// exactamente como un verificador deja de proteger sin que nadie se entere.
const MINIMO_ARCHIVOS = 200;

// ── Recolección ───────────────────────────────────────────────────────────────

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'migrations'].includes(e.name)) continue;
      walk(p, acc);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

// ── Análisis ──────────────────────────────────────────────────────────────────

/** Primer comando de la SQL, saltando comentarios. */
function comandoSql(sql) {
  const limpio = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  const m = limpio.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : '?';
}

/** Texto del argumento desde su paréntesis de apertura. */
function extraerArgs(txt, iAbre) {
  let prof = 0;
  for (let i = iAbre; i < txt.length; i++) {
    if (txt[i] === '(') prof++;
    else if (txt[i] === ')') { prof--; if (prof === 0) return txt.slice(iAbre + 1, i); }
  }
  return '';
}

const RE_QUERY =
  /([^\n]*?)\b(?:this\.)?(?:ds|dataSource|manager|queryRunner|entityManager|conn|connection|repo|repository)\.query\s*(?:<[^>]*>)?\s*\(/g;

/**
 * @returns {{ref:string, motivo:string, sql:string}[]}
 */
function analizar(archivos, raiz) {
  const hallazgos = [];

  for (const archivo of archivos) {
    const txt = fs.readFileSync(archivo, 'utf8');
    let m;
    RE_QUERY.lastIndex = 0;

    while ((m = RE_QUERY.exec(txt)) !== null) {
      const antes  = m[1].trimEnd();
      const iAbre  = m.index + m[0].length - 1;
      const args   = extraerArgs(txt, iAbre);

      const sm = args.match(/^\s*`([\s\S]*?)`|^\s*'([\s\S]*?)'|^\s*"([\s\S]*?)"/);
      if (!sm) continue;
      const sql = sm[1] ?? sm[2] ?? sm[3] ?? '';

      // Solo UPDATE y DELETE. Un WITH de arriba ya es la forma correcta.
      const cmd = comandoSql(sql);
      if (cmd !== 'UPDATE' && cmd !== 'DELETE') continue;

      const finLlamada = txt.indexOf(')', iAbre + args.length);
      const despues    = txt.slice(finLlamada + 1, finLlamada + 60).replace(/\s+/g, ' ');
      const linea      = txt.slice(0, m.index).split('\n').length;
      const ref        = `${path.relative(raiz, archivo).replace(/\\/g, '/')}:${linea}`;
      const sqlCorta   = sql.replace(/\s+/g, ' ').trim().slice(0, 80);

      // Forma correcta 2: leer el índice [1], que es el rowCount.
      if (/^\s*\)*\s*\??\.?\[\s*1\s*\]/.test(despues)) continue;

      // Desestructurar el resultado: `const [row] = await ...query('UPDATE ...')`
      if (/(?:const|let|var)\s*\[/.test(antes)) {
        hallazgos.push({
          ref, sql: sqlCorta,
          motivo: `desestructura [row] sobre un ${cmd}: recibe el array entero, no la fila`,
        });
        continue;
      }

      // `.length` encadenado directamente.
      if (/^\s*\)*\s*\)?\s*\.\s*length/.test(despues)) {
        hallazgos.push({
          ref, sql: sqlCorta,
          motivo: `.length sobre un ${cmd}: vale siempre 2, aunque no tocara ninguna fila`,
        });
        continue;
      }

      // Asignado a una variable: ¿se lee luego con .length o se desestructura?
      const varM = antes.match(/(?:const|let|var)\s+(\w+)\s*=/);
      if (varM) {
        const nombre     = varM[1];
        const siguientes = txt.slice(finLlamada, finLlamada + 500);
        if (new RegExp(`\\b${nombre}\\s*\\??\\.\\s*length\\b`).test(siguientes)) {
          hallazgos.push({
            ref, sql: sqlCorta,
            motivo: `${nombre}.length sobre un ${cmd}: vale siempre 2`,
          });
          continue;
        }
        if (new RegExp(`(?:const|let|var)\\s*\\[[^\\]]*\\]\\s*=\\s*${nombre}\\b`).test(siguientes)) {
          hallazgos.push({
            ref, sql: sqlCorta,
            motivo: `desestructura ${nombre} de un ${cmd}: recibe el array entero`,
          });
          continue;
        }
      }
    }
  }
  return hallazgos;
}

// ── Autotest: el verificador se prueba a sí mismo ─────────────────────────────

function autotest() {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vur-'));
  const escribir = (nombre, contenido) => {
    const p = path.join(tmp, nombre);
    fs.writeFileSync(p, contenido);
    return p;
  };

  const MAL_LENGTH = `
    export class A {
      async reclamar() {
        const filas = await this.ds.query(\`UPDATE t SET marca = now()
           WHERE id = $1 AND marca IS NULL RETURNING id\`, [1]);
        return filas.length > 0;
      }
    }`;

  const MAL_DESTRUCTURA = `
    export class B {
      async editar() {
        const [row] = await this.ds.query(\`UPDATE t SET a = 1 WHERE id = $1 RETURNING *\`, [1]);
        return row;
      }
    }`;

  const BIEN_CTE = `
    export class C {
      async reclamar() {
        const [r] = await this.ds.query(\`WITH x AS (
          UPDATE t SET marca = now() WHERE id = $1 AND marca IS NULL RETURNING id
        ) SELECT COUNT(*)::int AS n FROM x\`, [1]);
        return Number(r?.n ?? 0) > 0;
      }
    }`;

  const BIEN_ROWCOUNT = `
    export class D {
      async limpiar() {
        const result = await this.ds.query(\`DELETE FROM token_blacklist WHERE expires_at < NOW()\`);
        this.logger.log(\`Blacklist limpiada: \${result?.[1] ?? 0} tokens\`);
      }
    }`;

  const BIEN_DESCARTADO = `
    export class E {
      async marcar() {
        await this.ds.query(\`UPDATE t SET a = 1 WHERE id = $1\`, [1]);
      }
    }`;

  const BIEN_INSERT = `
    export class F {
      async crear() {
        const [row] = await this.ds.query(\`INSERT INTO t (a) VALUES ($1) RETURNING *\`, [1]);
        return row;
      }
    }`;

  const casos = [
    ['mal-length.ts',       MAL_LENGTH,       true,  '.length sobre un UPDATE'],
    ['mal-destructura.ts',  MAL_DESTRUCTURA,  true,  'const [row] sobre un UPDATE'],
    ['bien-cte.ts',         BIEN_CTE,         false, 'CTE + SELECT COUNT(*)'],
    ['bien-rowcount.ts',    BIEN_ROWCOUNT,    false, 'result?.[1] como rowCount'],
    ['bien-descartado.ts',  BIEN_DESCARTADO,  false, 'resultado descartado'],
    ['bien-insert.ts',      BIEN_INSERT,      false, 'INSERT (devuelve filas planas)'],
  ];

  let fallos = 0;
  console.log('\n  Autotest del verificador:\n');
  for (const [nombre, codigo, debeFallar, etiqueta] of casos) {
    const p = escribir(nombre, codigo);
    const h = analizar([p], tmp);
    const marcado = h.length > 0;
    const ok = marcado === debeFallar;
    if (!ok) fallos++;
    console.log(`    ${ok ? '\x1b[32mOK\x1b[0m  ' : '\x1b[31mFALLA\x1b[0m'} ${debeFallar ? 'DEBE marcar ' : 'NO debe marcar'} — ${etiqueta}`);
    if (marcado && debeFallar) console.log(`         → ${h[0].motivo}`);
    if (marcado && !debeFallar) console.log(`         → marcó por error: ${h[0].motivo}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  if (fallos > 0) {
    console.error(`\n❌ El verificador no se comporta como debe (${fallos} caso(s)).\n`);
    process.exit(1);
  }
  console.log('\n✅ Autotest OK — marca los dos casos rotos y deja pasar las dos formas correctas.\n');
}

// ── Principal ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--autotest')) { autotest(); process.exit(0); }

if (!fs.existsSync(RAIZ_SRC)) {
  console.error(`❌ No existe ${RAIZ_SRC}. El verificador no ha mirado nada.`);
  process.exit(1);
}

const archivos = walk(RAIZ_SRC);

// La guarda del árbol vacío. Un verificador que escanea 0 archivos y sale en
// verde es peor que no tenerlo: da confianza sin mirar.
if (archivos.length < MINIMO_ARCHIVOS) {
  console.error(`❌ Solo se encontraron ${archivos.length} archivos .ts en ${RAIZ_SRC}.`);
  console.error(`   Se esperaban al menos ${MINIMO_ARCHIVOS}. El árbol está vacío o la ruta es otra:`);
  console.error(`   pasar en verde sin haber mirado nada es el fallo que este mensaje evita.`);
  process.exit(1);
}

const hallazgos = analizar(archivos, RAIZ_SRC);

let baseline = [];
if (!args.includes('--todos') && fs.existsSync(BASELINE_FILE)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).sitios ?? [];
}

if (args.includes('--actualizar-baseline')) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    _comentario: 'Sitios que ya existían cuando se creó el verificador. Se van quitando según el barrido los corrija. Regenerar: node scripts/validate-update-returning.js --actualizar-baseline',
    generado: new Date().toISOString().slice(0, 10),
    sitios: hallazgos.map(h => h.ref).sort(),
  }, null, 2) + '\n');
  console.log(`✅ Baseline actualizado con ${hallazgos.length} sitio(s).`);
  process.exit(0);
}

const conocidos = new Set(baseline);
const nuevos    = hallazgos.filter(h => !conocidos.has(h.ref));
const yaCorregidos = baseline.filter(ref => !hallazgos.some(h => h.ref === ref));

if (nuevos.length > 0) {
  console.error(`\n❌ ${nuevos.length} guarda(s) rota(s) sobre el resultado de un UPDATE/DELETE:\n`);
  for (const h of nuevos) {
    console.error(`   ${h.ref}`);
    console.error(`      ${h.motivo}`);
    console.error(`      ${h.sql}`);
    console.error('');
  }
  console.error('   query() solo devuelve filas planas en un SELECT. Con UPDATE/DELETE');
  console.error('   devuelve [filas, rowCount] — length 2 aunque no tocara nada.\n');
  console.error('   Las dos formas correctas:');
  console.error('     1) Envolver el UPDATE en un CTE y leer un SELECT COUNT(*)::int arriba.');
  console.error('     2) Leer el rowCount: `result?.[1] ?? 0`.');
  console.error('        Ejemplo en el repo: src/auth/token-blacklist.service.ts:40\n');
  process.exit(1);
}

if (yaCorregidos.length > 0) {
  console.log(`ℹ️  ${yaCorregidos.length} sitio(s) del baseline ya están corregidos.`);
  console.log('   Quitarlos con: node scripts/validate-update-returning.js --actualizar-baseline');
}

console.log(
  `✅ UPDATE/RETURNING OK — ${archivos.length} archivos revisados, ` +
  `sin guardas rotas nuevas (${baseline.length} en baseline pendientes del barrido)`,
);
