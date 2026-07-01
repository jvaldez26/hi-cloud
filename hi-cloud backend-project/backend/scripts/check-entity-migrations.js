#!/usr/bin/env node
/**
 * check-entity-migrations.js — CAPA 3 (análisis estático)
 *
 * Verifica que cada columna declarada en los entity files TypeORM esté cubierta por:
 *   a) Una migración TypeScript en src/migrations/  (ADD COLUMN o CREATE TABLE)
 *   b) El snapshot pre-baseline en scripts/baseline-columns.json
 *
 * No requiere base de datos. Lee directamente los archivos .ts.
 *
 * Exit code:
 *   0 — todas las columnas están cubiertas
 *   1 — hay columnas sin migración
 *
 * Hubiera atrapado el incidente del 2026-07-01 (descuentoGeneralPct/Monto en entity
 * sin migración TypeScript, solo un .sql en seeds/ que TypeORM nunca ejecuta).
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT           = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'src', 'migrations');
const ENTITIES_ROOT  = path.join(ROOT, 'src');
const BASELINE_FILE  = path.join(__dirname, 'baseline-columns.json');

// ── 1. Columns added by TypeScript migrations ──────────────────────────────
function getMigrationColumns() {
  const cols = new Set();
  if (!fs.existsSync(MIGRATIONS_DIR)) return cols;

  for (const file of fs.readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.ts') || file.toLowerCase().includes('baseline')) continue;

    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    // ADD COLUMN [IF NOT EXISTS] "colName" or ADD COLUMN colName
    const addCol = /ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+["'`]?(\w+)["'`]?/gi;
    let m;
    while ((m = addCol.exec(text)) !== null) {
      cols.add(m[1]);
      cols.add(m[1].toLowerCase());
    }

    // CREATE TABLE … (colName TYPE …)
    // Capture everything between ( and ) after CREATE TABLE, then parse column defs
    const createTbl = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["'`]?\w+["'`]?\s*\(([\s\S]*?)\)\s*;/gi;
    while ((m = createTbl.exec(text)) !== null) {
      const body = m[1];
      // Each column def starts with a quoted or unquoted identifier followed by a type keyword
      const colDef = /^\s*["'`]?(\w+)["'`]?\s+(?:VARCHAR|TEXT|INT|INTEGER|BIGINT|SERIAL|BIGSERIAL|BOOLEAN|BOOL|DATE|TIMESTAMP|UUID|NUMERIC|DECIMAL|FLOAT|DOUBLE|REAL|JSON|JSONB|CHAR|SMALLINT)/gmi;
      let cm;
      while ((cm = colDef.exec(body)) !== null) {
        cols.add(cm[1]);
        cols.add(cm[1].toLowerCase());
      }
    }

    // RENAME COLUMN old TO new — covers renames that "add" a column under new name
    const rename = /RENAME\s+COLUMN\s+["'`]?\w+["'`]?\s+TO\s+["'`]?(\w+)["'`]?/gi;
    while ((m = rename.exec(text)) !== null) {
      cols.add(m[1]);
      cols.add(m[1].toLowerCase());
    }
  }

  return cols;
}

// ── 2. Columns declared in entity files ────────────────────────────────────
function getEntityColumns() {
  const result = new Map(); // tableName → Set<colName>

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        walk(full);
      } else if (entry.name.endsWith('.entity.ts')) {
        parseEntityFile(full, result);
      }
    }
  }

  walk(ENTITIES_ROOT);
  return result;
}

function parseEntityFile(filePath, result) {
  const text  = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  // Determine table name from @Entity('name') or @Entity()
  let tableName = null;
  const entityMatch = text.match(/@Entity\(\s*['"`]([^'"`]+)['"`]/);
  if (entityMatch) {
    tableName = entityMatch[1];
  } else if (/@Entity\(/.test(text)) {
    // @Entity() without explicit name → we skip (view entities, etc.)
    const classMatch = text.match(/export\s+class\s+(\w+)/);
    if (classMatch) {
      // Derive table name: PascalCase → snake_case → lowercase (TypeORM default)
      tableName = classMatch[1]
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase();
    }
  }
  if (!tableName) return;

  const cols = result.get(tableName) ?? new Set();
  result.set(tableName, cols);

  // Column decorators: @Column, @PrimaryGeneratedColumn, @PrimaryColumn,
  // @CreateDateColumn, @UpdateDateColumn, @DeleteDateColumn, @VersionColumn
  const DECORATORS = [
    '@Column',
    '@PrimaryGeneratedColumn',
    '@PrimaryColumn',
    '@CreateDateColumn',
    '@UpdateDateColumn',
    '@DeleteDateColumn',
    '@VersionColumn',
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isColDecorator = DECORATORS.some(d => trimmed.startsWith(d));
    if (!isColDecorator) continue;

    // Collect the full decorator (may span multiple lines until the closing paren)
    let decoratorText = trimmed;
    let depth = (trimmed.match(/\(/g) || []).length - (trimmed.match(/\)/g) || []).length;
    let j = i + 1;
    while (depth > 0 && j < lines.length) {
      decoratorText += ' ' + lines[j].trim();
      depth += (lines[j].match(/\(/g) || []).length - (lines[j].match(/\)/g) || []).length;
      j++;
    }

    // Skip to first non-decorator line to get property name
    while (j < lines.length && DECORATORS.some(d => lines[j].trim().startsWith(d))) {
      // collect that decorator too (multi-decorator columns)
      j++;
    }

    const propLine = j < lines.length ? lines[j].trim() : '';
    const propMatch = propLine.match(/^(readonly\s+)?(\w+)[?!]?\s*:/);
    if (!propMatch) continue;
    const propName = propMatch[2];

    // Explicit name option in decorator overrides property name
    const nameOpt = decoratorText.match(/\bname\s*:\s*['"`](\w+)['"`]/);
    const colName = nameOpt ? nameOpt[1] : propName;

    // Skip virtual / computed columns (no DB column)
    if (/\bselect\s*:\s*false\b/.test(decoratorText)) continue;

    cols.add(colName);
  }
}

// ── 3. Baseline columns (pre-migration-system schema) ──────────────────────
function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('❌ scripts/baseline-columns.json no encontrado.');
    console.error('   Generar con: node scripts/generate-baseline-columns.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}

// ── Main ───────────────────────────────────────────────────────────────────
const migrationCols = getMigrationColumns();
const entityCols    = getEntityColumns();
const baseline      = loadBaseline();

const issues = [];

for (const [table, cols] of entityCols) {
  const baselineSet = new Set([
    ...(baseline[table] ?? []),
    ...(baseline[table] ?? []).map(c => c.toLowerCase()),
  ]);

  for (const col of cols) {
    if (col === 'id') continue; // PK always implicit
    const covered =
      migrationCols.has(col) ||
      migrationCols.has(col.toLowerCase()) ||
      baselineSet.has(col) ||
      baselineSet.has(col.toLowerCase());

    if (!covered) {
      issues.push(`[${table}] columna "${col}" no tiene migración TypeScript en src/migrations/`);
    }
  }
}

if (issues.length > 0) {
  console.error('');
  console.error('❌ CAPA 3 — COLUMNAS SIN MIGRACIÓN DETECTADAS:');
  issues.forEach(i => console.error('  ✗', i));
  console.error('');
  console.error('  → Crea una migración TypeScript en src/migrations/');
  console.error('    npm run migration:generate -- src/migrations/NombreDescriptivo');
  console.error('  → NUNCA pongas migraciones como .sql en seeds/');
  console.error('    (TypeORM no las ejecuta automáticamente)');
  console.error('');
  process.exit(1);
}

const total = [...entityCols.values()].reduce((s, c) => s + c.size, 0);
const tables = entityCols.size;
console.log(`✅ CAPA 3 OK — ${total} columnas en ${tables} entidades, todas cubiertas por migración o baseline`);
process.exit(0);
