#!/usr/bin/env node
/**
 * generate-baseline-columns.js
 *
 * Genera scripts/baseline-columns.json con las columnas que existían
 * ANTES de adoptar el sistema de migraciones TypeORM.
 *
 * Algoritmo: baseline = entity_columns - migration_columns
 *
 * Ejecutar UNA VEZ al configurar este sistema:
 *   node scripts/generate-baseline-columns.js
 *
 * El resultado se commitea al repo.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT           = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'src', 'migrations');
const ENTITIES_ROOT  = path.join(ROOT, 'src');

// ── Reuse same parsing logic ───────────────────────────────────────────────
function getMigrationColumns() {
  const cols = new Set();
  if (!fs.existsSync(MIGRATIONS_DIR)) return cols;

  for (const file of fs.readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.ts') || file.toLowerCase().includes('baseline')) continue;
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    const addCol = /ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+["'`]?(\w+)["'`]?/gi;
    let m;
    while ((m = addCol.exec(text)) !== null) { cols.add(m[1]); cols.add(m[1].toLowerCase()); }

    const createTbl = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["'`]?\w+["'`]?\s*\(([\s\S]*?)\)\s*;/gi;
    while ((m = createTbl.exec(text)) !== null) {
      const colDef = /^\s*["'`]?(\w+)["'`]?\s+(?:VARCHAR|TEXT|INT|INTEGER|BIGINT|SERIAL|BIGSERIAL|BOOLEAN|BOOL|DATE|TIMESTAMP|UUID|NUMERIC|DECIMAL|FLOAT|DOUBLE|REAL|JSON|JSONB|CHAR|SMALLINT)/gmi;
      let cm;
      while ((cm = colDef.exec(m[1])) !== null) { cols.add(cm[1]); cols.add(cm[1].toLowerCase()); }
    }

    const rename = /RENAME\s+COLUMN\s+["'`]?\w+["'`]?\s+TO\s+["'`]?(\w+)["'`]?/gi;
    while ((m = rename.exec(text)) !== null) { cols.add(m[1]); cols.add(m[1].toLowerCase()); }
  }
  return cols;
}

function parseEntityFile(filePath, result) {
  const text  = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  let tableName = null;
  const entityMatch = text.match(/@Entity\(\s*['"`]([^'"`]+)['"`]/);
  if (entityMatch) {
    tableName = entityMatch[1];
  } else if (/@Entity\(/.test(text)) {
    const classMatch = text.match(/export\s+class\s+(\w+)/);
    if (classMatch) {
      tableName = classMatch[1].replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    }
  }
  if (!tableName) return;

  const cols = result.get(tableName) ?? new Set();
  result.set(tableName, cols);

  const DECORATORS = [
    '@Column', '@PrimaryGeneratedColumn', '@PrimaryColumn',
    '@CreateDateColumn', '@UpdateDateColumn', '@DeleteDateColumn', '@VersionColumn',
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!DECORATORS.some(d => trimmed.startsWith(d))) continue;

    let decoratorText = trimmed;
    let depth = (trimmed.match(/\(/g) || []).length - (trimmed.match(/\)/g) || []).length;
    let j = i + 1;
    while (depth > 0 && j < lines.length) {
      decoratorText += ' ' + lines[j].trim();
      depth += (lines[j].match(/\(/g) || []).length - (lines[j].match(/\)/g) || []).length;
      j++;
    }

    while (j < lines.length && DECORATORS.some(d => lines[j].trim().startsWith(d))) j++;

    const propLine = j < lines.length ? lines[j].trim() : '';
    const propMatch = propLine.match(/^(readonly\s+)?(\w+)[?!]?\s*:/);
    if (!propMatch) continue;

    if (/\bselect\s*:\s*false\b/.test(decoratorText)) continue;

    const nameOpt = decoratorText.match(/\bname\s*:\s*['"`](\w+)['"`]/);
    cols.add(nameOpt ? nameOpt[1] : propMatch[2]);
  }
}

function getEntityColumns() {
  const result = new Map();
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

// ── Generate baseline ──────────────────────────────────────────────────────
const migrationCols = getMigrationColumns();
const entityCols    = getEntityColumns();

const baseline = {};
let totalBaseline = 0;
let totalMigrated = 0;

for (const [table, cols] of entityCols) {
  const baselineCols = [];
  for (const col of cols) {
    if (col === 'id') continue;
    if (migrationCols.has(col) || migrationCols.has(col.toLowerCase())) {
      totalMigrated++;
    } else {
      baselineCols.push(col);
      totalBaseline++;
    }
  }
  if (baselineCols.length > 0) {
    baseline[table] = baselineCols.sort();
  }
}

const outFile = path.join(__dirname, 'baseline-columns.json');
fs.writeFileSync(outFile, JSON.stringify(baseline, null, 2) + '\n');

console.log(`✅ baseline-columns.json generado:`);
console.log(`   ${Object.keys(baseline).length} tablas con columnas pre-baseline`);
console.log(`   ${totalBaseline} columnas pre-baseline`);
console.log(`   ${totalMigrated} columnas cubiertas por migraciones`);
