/**
 * reset-password.js
 *
 * Restablece la contraseña de un usuario directamente en la BD.
 * Útil cuando se pierde acceso y no se puede hacer login.
 *
 * Uso:
 *   node scripts/reset-password.js --email admin@hicloud.com --pass NuevaPass123!
 *   node scripts/reset-password.js --all --pass HiCloud2026!   (todos los usuarios)
 */

const { Client } = require('pg');
const bcrypt = require('bcrypt');
const path   = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function run() {
  const args    = process.argv.slice(2);
  const emailIdx = args.indexOf('--email');
  const passIdx  = args.indexOf('--pass');
  const resetAll = args.includes('--all');

  if (passIdx === -1) {
    console.error('Uso: node scripts/reset-password.js --email <email> --pass <nueva_contraseña>');
    console.error('     node scripts/reset-password.js --all --pass <nueva_contraseña>');
    process.exit(1);
  }

  const email   = emailIdx !== -1 ? args[emailIdx + 1] : null;
  const newPass = args[passIdx + 1];

  if (!resetAll && !email) {
    console.error('Debes especificar --email <email> o --all');
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

  await client.connect();
  console.log('✅ Conectado a BD\n');

  const hash = await bcrypt.hash(newPass, 12);

  if (resetAll) {
    const { rows } = await client.query('SELECT id, email, role FROM users WHERE \"isActive\" = true ORDER BY id');
    for (const u of rows) {
      await client.query('UPDATE users SET password = $1 WHERE id = $2', [hash, u.id]);
      console.log(`✅ [#${u.id}] ${u.email} (${u.role}) → contraseña actualizada`);
    }
  } else {
    const { rows } = await client.query('SELECT id, email, role FROM users WHERE email = $1 AND \"isActive\" = true', [email]);
    if (rows.length === 0) {
      console.error(`❌ Usuario '${email}' no encontrado o inactivo`);
      await client.end();
      process.exit(1);
    }
    await client.query('UPDATE users SET password = $1 WHERE email = $2', [hash, email]);
    console.log(`✅ Contraseña de '${email}' restablecida correctamente`);
  }

  console.log(`\nNueva contraseña: ${newPass}`);
  console.log('\n⚠️  Cambia esta contraseña después de iniciar sesión por seguridad.\n');

  await client.end();
}

run().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
