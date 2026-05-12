const { Client } = require('pg');
const bcrypt     = require('bcrypt');

const DB = {
  host: 'hicloud-db.cjc0a822i31y.us-east-2.rds.amazonaws.com',
  port: 5432, user: 'postgres', password: 'Higlobal-4691',
  database: 'hicloud', ssl: { rejectUnauthorized: false },
};

async function main() {
  const c = new Client(DB);
  await c.connect();

  const PASS = 'HiVGBNxRbFCdg767';

  // 1. Ver el hash actual de cada usuario
  const r = await c.query('SELECT id, email, password FROM users ORDER BY id');
  console.log('\n=== VERIFICACIÓN DIRECTA DE HASHES ===\n');

  for (const row of r.rows) {
    const ok = await bcrypt.compare(PASS, row.password);
    console.log(`[${row.email}]`);
    console.log(`  hash (primeros 30): ${row.password.substring(0, 30)}...`);
    console.log(`  bcrypt.compare("${PASS}") = ${ok ? '✅ COINCIDE' : '❌ NO COINCIDE'}`);
    console.log('');
  }

  // 2. Crear un hash nuevo y verificarlo inmediatamente
  console.log('=== TEST DE BCRYPT DIRECTO ===');
  const testPass = PASS;
  const nuevoHash = await bcrypt.hash(testPass, 12);
  const testOk = await bcrypt.compare(testPass, nuevoHash);
  console.log(`bcrypt.hash + compare inmediato: ${testOk ? '✅ OK' : '❌ FALLO'}`);
  console.log(`hash generado ahora: ${nuevoHash.substring(0, 30)}...`);

  // 3. Verificar qué devuelve el SELECT con isActive
  console.log('\n=== CAMPOS CLAVE EN BD ===');
  const r2 = await c.query(
    `SELECT id, email, role, "isActive", LEFT(password,7) AS prefix, LENGTH(password) AS len
     FROM users ORDER BY id`
  );
  console.log(JSON.stringify(r2.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
