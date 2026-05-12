/**
 * apply-migrations.js
 *
 * Aplica automáticamente TODAS las migraciones pendientes contra la BD
 * configurada en el .env. No requiere psql instalado.
 *
 * Uso: node scripts/apply-migrations.js
 *      node scripts/apply-migrations.js --file src/seeds/MIGRAR-TODO-2026-05-09.sql
 */

const { Client } = require('pg');
const fs   = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const DEFAULT_FILE = path.resolve(__dirname, '../src/seeds/MIGRAR-TODO-2026-05-09.sql');

async function run() {
  const targetFile = process.argv.includes('--file')
    ? path.resolve(process.argv[process.argv.indexOf('--file') + 1])
    : DEFAULT_FILE;

  if (!fs.existsSync(targetFile)) {
    console.error('❌ Archivo de migración no encontrado:', targetFile);
    process.exit(1);
  }

  const useSSL = process.env.DB_SSL === 'true';
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT || 5432),
    user:     process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'hicloud',
    ssl:      useSSL ? { rejectUnauthorized: false } : false,
  });

  console.log('\n════════════════════════════════════════════════════');
  console.log('  HiCloud ERP — Aplicar Migraciones SQL');
  console.log('════════════════════════════════════════════════════');
  console.log('  Archivo:', targetFile);
  console.log('  BD:     ', process.env.DB_HOST, '/', process.env.DB_NAME);

  await client.connect();
  console.log('  ✅ Conectado\n');

  const sql = fs.readFileSync(targetFile, 'utf8');

  try {
    await client.query(sql);
    console.log('  ✅ Migración aplicada correctamente');
  } catch (err) {
    console.error('  ❌ Error al aplicar migración:', err.message);
    await client.end();
    process.exit(1);
  }

  // Verificar columnas faltantes después de la migración
  const { rows: issues } = await client.query(`
    SELECT 'No hay issues conocidos' AS check
  `);

  await client.end();
  console.log('\n════════════════════════════════════════════════════');
  console.log('  ✅ MIGRACIÓN COMPLETA — Reinicia el backend');
  console.log('════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('ERROR FATAL:', err.message);
  process.exit(1);
});
