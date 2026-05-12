/**
 * SCRIPT DE RECUPERACIÓN DE ACCESO — HiCloud ERP
 * ─────────────────────────────────────────────────
 * Uso: npm run recover
 *
 * Resetea la contraseña del Super Admin y genera una nueva contraseña
 * segura aleatoria. Usa solo si estás bloqueado del sistema.
 *
 * REQUISITOS: Node.js, acceso a la BD (variables en .env o hardcoded aquí).
 */

require('dotenv').config();
const { Client } = require('pg');
const crypto     = require('crypto');
const bcrypt     = require('bcrypt');

// ── Configuración BD ─────────────────────────────────────────────────────────
const DB = {
  host:     process.env.DB_HOST     ?? 'hicloud-db.cjc0a822i31y.us-east-2.rds.amazonaws.com',
  port:     Number(process.env.DB_PORT     ?? 5432),
  user:     process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'Higlobal-4691',
  database: process.env.DB_NAME     ?? 'hicloud',
  ssl:      { rejectUnauthorized: false },
};

// ── Genera contraseña aleatoria segura ───────────────────────────────────────
function generarContrasena() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  const bytes = crypto.randomBytes(16);
  for (let i = 0; i < 12; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  // Asegurar al menos 1 mayúscula, 1 minúscula, 1 número
  pwd = 'Hi' + pwd + crypto.randomInt(10, 99);
  return pwd;
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   RECUPERACIÓN DE ACCESO — HiCloud ERP  ║');
  console.log('╚════════════════════════════════════════╝\n');

  const c = new Client(DB);

  try {
    await c.connect();
    console.log('✅ Conectado a la base de datos\n');

    // Mostrar usuarios existentes
    const usuarios = await c.query(
      `SELECT id, nombre, email, role, "isActive" FROM users ORDER BY role DESC, id ASC`
    );

    console.log('Usuarios en el sistema:');
    usuarios.rows.forEach(u => {
      const estado = u.isActive ? '🟢 activo' : '🔴 inactivo';
      console.log(`  [#${u.id}] ${u.email} — ${u.role} — ${estado}`);
    });

    // Resetear TODOS los admins activos
    const nuevaContrasena = generarContrasena();
    const hash = await bcrypt.hash(nuevaContrasena, 12);

    const result = await c.query(
      `UPDATE users SET password = $1
       WHERE "isActive" = true AND role IN ('admin', 'super_admin')
       RETURNING id, email, role`,
      [hash]
    );

    console.log('\n');
    console.log('╔════════════════════════════════════════╗');
    console.log('║         CONTRASEÑA TEMPORAL             ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  ${nuevaContrasena.padEnd(38)} ║`);
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log('Cuentas actualizadas:');
    result.rows.forEach(r => console.log(`  ✅ ${r.email} (${r.role})`));
    console.log('');
    console.log('⚠️  IMPORTANTE: Cambia esta contraseña desde');
    console.log('   Perfil → Cambiar contraseña después de entrar.');
    console.log('');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await c.end();
  }
}

main();
