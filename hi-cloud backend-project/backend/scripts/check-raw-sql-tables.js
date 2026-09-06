#!/usr/bin/env node
/**
 * check-raw-sql-tables.js — SQL crudo con nombres de tabla escritos a mano
 *
 * Detecta la FORMA del bug del incidente RDS del 2026-09-06, no una lista fija
 * de nombres: `auth.service.ts` y `session-lifetime.service.ts` leían
 * MAX_INTENTOS_LOGIN/SESION_HORAS de "configuracion_sistema" (singular), que
 * nunca existió — la tabla real es "configuraciones_sistema" (la del
 * @Entity). El SELECT fallaba SIEMPRE, un catch lo tragaba, y la plataforma
 * corrió meses con el default sin que nadie lo notara. El mismo patrón
 * apareció, la misma semana, cuatro veces más: `cobranza.service.ts`
 * (JOIN a "usuarios", la tabla real es "users"), y dos en
 * `portal-empleado.service.ts` ("vacaciones" → solicitudes_vacacion,
 * "periodos_nomina"/"lineas_nomina" → nomina_periodos/nomina_lineas).
 *
 * Este check no persigue esos nombres concretos (para eso están los CHECK 9,
 * 11 y 12 de security-check.sh, uno por incidente ya confirmado). Persigue la
 * FORMA: cualquier identificador después de FROM/JOIN/UPDATE/INSERT INTO en
 * SQL crudo que no corresponda a ninguna tabla real conocida — ni el nombre
 * de un @Entity, ni una tabla auto-gestionada (CREATE TABLE en el propio
 * código), ni una CTE definida en la misma consulta.
 *
 * Es heurístico a propósito — nuevas tablas legítimas aparecen constantemente
 * y este script no puede conocerlas todas de antemano en casos raros (nombres
 * armados dinámicamente, por ejemplo). Por eso es una ADVERTENCIA, no un
 * bloqueo: security-check.sh la imprime pero no la cuenta como error. Cada
 * hit real que se confirme como bug se persigue por su nombre concreto con un
 * check dedicado (como los de CHECK 9/11/12), que sí bloquea.
 *
 * No requiere base de datos. Lee directamente los archivos .ts.
 *
 * Exit code: siempre 0 — es un check de advertencia (ver arriba). Escribe a
 * stdout la lista de hits; el llamador decide qué hacer con la salida.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

// ── Tablas de sistema / catálogos de Postgres — nunca son el bug que buscamos ──
const SISTEMA = new Set([
  'information_schema', 'pg_class', 'pg_constraint', 'pg_enum', 'pg_type',
  'pg_stat_activity', 'pg_index', 'pg_attribute', 'pg_namespace', 'pg_proc',
  'pg_trigger', 'pg_extension', 'pg_tables', 'pg_indexes', 'pg_views',
  'typeorm_migrations', 'query_result', 'fila', // WITH fila AS (UPDATE ... RETURNING *) — patrón repetido en agro/*
  'token_blacklist', // tabla real en producción, sin migración TS ni @Entity — creada a mano en su día
]);

// Palabras reservadas de SQL que el patrón FROM/JOIN/UPDATE puede capturar por
// error como si fueran un nombre de tabla (p. ej. "ON CONFLICT DO UPDATE SET").
const PALABRAS_RESERVADAS = new Set(['SET', 'ONLY', 'LATERAL']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const ALL_FILES = walk(SRC);

// ── 1. Tablas reales: @Entity('nombre') ────────────────────────────────────
const TABLAS_ENTITY = new Set();
for (const file of ALL_FILES) {
  if (!file.endsWith('.entity.ts')) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/@Entity\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g)) {
    TABLAS_ENTITY.add(m[1]);
  }
}

// ── 2. Tablas auto-gestionadas: CREATE TABLE en el propio código ───────────
const TABLAS_CREATE = new Set();
for (const file of ALL_FILES) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi)) {
    TABLAS_CREATE.add(m[1]);
  }
}

const TABLAS_VALIDAS = new Set([...TABLAS_ENTITY, ...TABLAS_CREATE, ...SISTEMA]);

// ── 3. Extraer bloques SQL: solo texto dentro de comillas/backticks que   ──
//     empieza como sentencia SQL — así los comentarios y strings sin SQL
//     (mensajes de error, logs) nunca entran a la búsqueda.
const RE_STRING_LITERAL = /`([^`]*)`|'((?:[^'\\]|\\.)*)'/g;
const RE_ES_SQL         = /^\s*(SELECT|UPDATE|INSERT|DELETE|WITH|ALTER|CREATE|DO\s+\$\$)/i;
// INTO exige INSERT delante: un bare "INTO" también es PL/pgSQL
// (`SELECT ... INTO variable`), que no es una tabla.
const RE_TABLA = /\b(FROM|JOIN|REFERENCES)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?|INSERT\s+INTO\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?|UPDATE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s/gi;
const RE_CTE            = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;

const hits = [];

for (const file of ALL_FILES) {
  if (file.endsWith('.spec.ts')) continue; // los tests no pegan a producción
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  for (const lit of src.matchAll(RE_STRING_LITERAL)) {
    const texto = lit[1] ?? lit[2] ?? '';
    if (!RE_ES_SQL.test(texto)) continue; // no es SQL — un log, un mensaje, etc.

    // CTEs de ESTA consulta — "WITH x AS (", ", y AS (" — no son tablas reales.
    const ctes = new Set();
    for (const m of texto.matchAll(RE_CTE)) ctes.add(m[1]);

    for (const m of texto.matchAll(RE_TABLA)) {
      const nombre = m[2] ?? m[3] ?? m[4];
      if (!nombre) continue;
      if (TABLAS_VALIDAS.has(nombre) || ctes.has(nombre)) continue;
      if (/^pg_/i.test(nombre)) continue; // catálogos con sufijo variable
      if (PALABRAS_RESERVADAS.has(nombre.toUpperCase())) continue; // "DO UPDATE SET" no es "UPDATE <tabla>"

      // "IS DISTINCT FROM x" es un operador de comparación, no una cláusula FROM.
      const antes = texto.slice(Math.max(0, m.index - 15), m.index);
      if (/DISTINCT\s*$/i.test(antes)) continue;

      // El siguiente carácter no-espacio tras el nombre delata que NO es una
      // tabla: "(" → función (EXTRACT(... FROM AGE(x)), JOIN LATERAL (subq)),
      // ")" → columna dentro de EXTRACT(campo FROM "columna"),
      // "." → en realidad es alias.columna (EXTRACT(MONTH FROM c.fecha)).
      const desdeMatch = texto.slice(m.index + m[0].length);
      const siguiente  = desdeMatch.match(/^\s*([.()])/)?.[1];
      if (siguiente) continue;

      const linea = src.slice(0, lit.index).split('\n').length;
      hits.push({ file: rel, linea, nombre, contexto: m[0].trim() });
    }
  }
}

// ── Salida ──────────────────────────────────────────────────────────────────
if (hits.length === 0) {
  console.log('✅ Sin nombres de tabla no reconocidos en SQL crudo');
  process.exit(0);
}

console.log(`⚠️  ${hits.length} referencia(s) a nombres de tabla no reconocidos en SQL crudo (revisar manualmente):`);
console.log('   Si es una tabla real que este script no conoce (falso positivo), añadir a SISTEMA en el script');
console.log('   o confirmar que tiene @Entity(...) / CREATE TABLE en el código. Si es el mismo bug del');
console.log('   incidente 2026-09-06, corregir el nombre y considerar un check dedicado en security-check.sh.\n');
for (const h of hits.slice(0, 30)) {
  console.log(`   ${h.file}:${h.linea} — "${h.nombre}" (${h.contexto})`);
}
if (hits.length > 30) console.log(`   ... y ${hits.length - 30} más`);

process.exit(0); // advertencia, no bloqueo — ver cabecera del archivo
