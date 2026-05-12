#!/usr/bin/env node
/**
 * validate-schema.js
 *
 * Script de validación pre-deploy: compara las columnas definidas en los
 * archivos *.entity.ts con las columnas reales en la base de datos PostgreSQL.
 *
 * Si hay desajuste, imprime qué columnas faltan y termina con código 1
 * (bloqueando el deploy).
 *
 * Uso:
 *   node scripts/validate-schema.js
 *   # o desde package.json:
 *   npm run validate:schema
 *
 * Variables de entorno requeridas:
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME, DB_SSL
 */

const { Client } = require('pg');
const fs   = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'hicloud',
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

/**
 * Extrae pares {table, column} de un archivo entity.ts.
 * Soporta múltiples @Entity por archivo (ej: entidad + detalle en un solo file).
 */
function extractEntityColumns(filePath) {
  const src     = fs.readFileSync(filePath, 'utf8');
  const results = [];

  // Dividir el archivo en bloques por cada @Entity
  // Encontramos los índices de cada @Entity
  const entityStartRegex = /@Entity\(['"`]([^'"`]+)['"`]\)/g;
  const blocks = [];
  let m;

  while ((m = entityStartRegex.exec(src)) !== null) {
    blocks.push({ table: m[1], start: m.index });
  }
  if (blocks.length === 0) return results;

  // Agregar un "bloque" centinela al final
  blocks.push({ table: null, start: src.length });

  for (let i = 0; i < blocks.length - 1; i++) {
    const { table, start } = blocks[i];
    const end      = blocks[i + 1].start;
    const blockSrc = src.slice(start, end);

    // Columnas en este bloque
    const colRegex = /@(?:Column|PrimaryColumn|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn|DeleteDateColumn)\s*(?:\([^)]*\))?\s*\n\s*(?:readonly\s+)?(\w+)/g;
    let cm;
    while ((cm = colRegex.exec(blockSrc)) !== null) {
      results.push({ table, column: cm[1] });
    }

    // JoinColumn FK explícitas
    const joinRegex = /@JoinColumn\(\s*\{[^}]*name:\s*['"`]([^'"`]+)['"`]/g;
    while ((cm = joinRegex.exec(blockSrc)) !== null) {
      results.push({ table, column: cm[1] });
    }
  }

  return results;
}

async function main() {
  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('  HiCloud ERP — Validación de Schema BD');
  console.log('════════════════════════════════════════════');
  console.log(`  BD: ${DB_CONFIG.host}/${DB_CONFIG.database}`);
  console.log('');

  const client = new Client(DB_CONFIG);
  try {
    await client.connect();
  } catch (e) {
    console.error('❌ No se pudo conectar a la BD:', e.message);
    process.exit(1);
  }

  const { rows: dbCols } = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);

  const dbMap = new Map();
  for (const r of dbCols) {
    if (!dbMap.has(r.table_name)) dbMap.set(r.table_name, new Set());
    dbMap.get(r.table_name).add(r.column_name);
  }

  const srcDir = path.join(__dirname, '..', 'src');
  const entityFiles = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.name.endsWith('.entity.ts')) entityFiles.push(full);
    }
  }
  scan(srcDir);

  console.log(`  📂 Entidades encontradas: ${entityFiles.length}`);
  console.log('');

  const issues        = [];
  const checkedCols   = new Set(); // table.column
  const missingTables = new Set(); // tabla que ya se reportó como faltante

  for (const file of entityFiles) {
    const cols = extractEntityColumns(file);
    for (const { table, column } of cols) {
      const key = `${table}.${column}`;
      if (checkedCols.has(key)) continue;
      checkedCols.add(key);

      if (!dbMap.has(table)) {
        // Reportar la tabla faltante solo una vez
        if (!missingTables.has(table)) {
          missingTables.add(table);
          issues.push(`  ✗ Tabla "${table}" no existe en BD [${path.basename(file)}]`);
        }
      } else if (!dbMap.get(table).has(column)) {
        issues.push(`  ✗ [${table}] columna "${column}" falta en BD [${path.basename(file)}]`);
      }
    }
  }

  await client.end();

  if (issues.length === 0) {
    console.log(`  ✅ Schema OK — ${checkedCols.size} columnas validadas`);
    console.log('');
    process.exit(0);
  }

  console.error('  ⚠  SCHEMA DRIFT — columnas/tablas faltantes en BD:');
  console.error('');
  issues.forEach(i => console.error(i));
  console.error('');
  console.error('  Ejecuta la migración pendiente antes de hacer deploy:');
  console.error('    src/seeds/migration-ecf-mseller.sql');
  console.error('');
  process.exit(1);
}

main().catch(e => {
  console.error('Error en validación de schema:', e.message);
  process.exit(1);
});
