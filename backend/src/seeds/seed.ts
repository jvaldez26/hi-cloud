/**
 * HiCloud ERP — Seed inicial
 * Compatible con el esquema actual de la BD (antes de sincronizar con TypeORM).
 *
 * Uso: npm run seed
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const AppDataSource = new DataSource({
  type:        'postgres',
  host:        process.env.DB_HOST     ?? 'localhost',
  port:        Number(process.env.DB_PORT ?? 5432),
  username:    process.env.DB_USERNAME ?? 'postgres',
  password:    process.env.DB_PASSWORD ?? 'Higlobal4691',
  database:    process.env.DB_NAME     ?? 'hicloud',
  synchronize: false,
  logging:     ['error'],
});

async function run(): Promise<void> {
  await AppDataSource.initialize();
  console.log('\n✅ Conectado a la BD:', process.env.DB_NAME ?? 'hicloud');

  const em = AppDataSource.createEntityManager();

  // ─────────────────────────────────────────────────────────────────────
  // Diagnóstico
  // ─────────────────────────────────────────────────────────────────────
  const users    = await em.query(`SELECT id, email, role, "isActive" FROM users LIMIT 10`);
  const empresas = await em.query(`SELECT id, rnc, nombre FROM empresa LIMIT 10`);
  const vinculos = await em.query(`SELECT "userId", "empresaId", rol, "isPrincipal", "isActive" FROM usuario_empresa LIMIT 20`);

  console.log('\n📋 Usuarios actuales:',     users.length    ? '' : 'NINGUNO');
  users.forEach((u: any) =>    console.log(`   #${u.id} ${u.email}  rol=${u.role}  activo=${u.isActive}`));

  console.log('\n🏢 Empresas actuales:',     empresas.length ? '' : 'NINGUNA');
  empresas.forEach((e: any) => console.log(`   #${e.id} ${e.rnc}  ${e.nombre}`));

  console.log('\n🔗 Vínculos usuario-empresa:', vinculos.length ? '' : 'NINGUNO');
  vinculos.forEach((v: any) => console.log(`   userId=${v.userId} → empresaId=${v.empresaId}  rol=${v.rol}  principal=${v.isPrincipal}`));

  // ─────────────────────────────────────────────────────────────────────
  // 1. Crear/actualizar usuario admin
  // ─────────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin1234', 12);
  let adminId: number;

  const existing = await em.query(`SELECT id FROM users WHERE email = $1`, ['admin@hicloud.com']);

  if (existing.length > 0) {
    adminId = existing[0].id;
    await em.query(
      `UPDATE users SET nombre = $1, password = $2, role = 'admin', "isActive" = true, "updatedAt" = NOW()
       WHERE id = $3`,
      ['Administrador', passwordHash, adminId],
    );
    console.log(`\n🔄 Contraseña del admin reseteada  (id=${adminId})`);
  } else {
    const res = await em.query(
      `INSERT INTO users (nombre, email, password, role, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'admin', true, NOW(), NOW()) RETURNING id`,
      ['Administrador', 'admin@hicloud.com', passwordHash],
    );
    adminId = res[0].id;
    console.log(`✅ Usuario admin creado  (id=${adminId})`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Crear/actualizar empresa demo (columnas reales de la BD)
  // ─────────────────────────────────────────────────────────────────────
  let empresaId: number;
  const existEmp = await em.query(`SELECT id FROM empresa WHERE rnc = $1`, ['132414691']);

  if (existEmp.length > 0) {
    empresaId = existEmp[0].id;
    await em.query(
      `UPDATE empresa SET nombre = $1, "nombreComercial" = $2, "updatedAt" = NOW()
       WHERE id = $3`,
      ['HiCloud Demo', 'HiCloud Demo', empresaId],
    );
    console.log(`🔄 Empresa demo actualizada  (id=${empresaId})`);
  } else {
    const res = await em.query(
      `INSERT INTO empresa (rnc, nombre, "nombreComercial", direccion, ciudad, moneda, "zonaHoraria", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'DOP', 'America/Santo_Domingo', true, NOW(), NOW())
       RETURNING id`,
      ['132414691', 'HiCloud Demo', 'HiCloud Demo', 'Av. Principal #1, Santo Domingo', 'Santo Domingo'],
    );
    empresaId = res[0].id;
    console.log(`✅ Empresa demo creada  (id=${empresaId})`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Vincular admin → empresa demo (isPrincipal = true)
  // ─────────────────────────────────────────────────────────────────────
  // Primero quitar cualquier vínculo principal anterior del admin
  await em.query(
    `UPDATE usuario_empresa SET "isPrincipal" = false WHERE "userId" = $1`,
    [adminId],
  );

  const existVinc = await em.query(
    `SELECT id FROM usuario_empresa WHERE "userId" = $1 AND "empresaId" = $2`,
    [adminId, empresaId],
  );

  if (existVinc.length > 0) {
    await em.query(
      `UPDATE usuario_empresa
       SET rol = 'admin', "isPrincipal" = true, "isActive" = true, "updatedAt" = NOW()
       WHERE "userId" = $1 AND "empresaId" = $2`,
      [adminId, empresaId],
    );
    console.log('🔄 Vínculo admin-empresa actualizado');
  } else {
    await em.query(
      `INSERT INTO usuario_empresa ("userId", "empresaId", rol, "isPrincipal", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'admin', true, true, NOW(), NOW())`,
      [adminId, empresaId],
    );
    console.log('✅ Admin vinculado a empresa demo como propietario');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Verificar: login correcto (simular bcrypt.compare)
  // ─────────────────────────────────────────────────────────────────────
  const finalUser = await em.query(
    `SELECT u.id, u.email, u.role, u."isActive", u.password, ue."empresaId", e.nombre AS empresa
     FROM users u
     LEFT JOIN usuario_empresa ue ON ue."userId" = u.id AND ue."isPrincipal" = true AND ue."isActive" = true
     LEFT JOIN empresa e ON e.id = ue."empresaId"
     WHERE u.email = 'admin@hicloud.com'`,
  );

  if (finalUser.length > 0) {
    const u = finalUser[0];
    const passwordOk = await bcrypt.compare('Admin1234', u.password);
    console.log('\n─────────────────────────────────────────────────');
    console.log('🎉 SEED COMPLETADO');
    console.log('─────────────────────────────────────────────────');
    console.log(`Usuario : ${u.email}`);
    console.log(`Rol     : ${u.role}  |  Activo: ${u.isActive}`);
    console.log(`Empresa : #${u.empresaId} — ${u.empresa ?? 'SIN EMPRESA'}`);
    console.log(`Password 'Admin1234' válida: ${passwordOk ? '✅ SÍ' : '❌ NO'}`);
    console.log('─────────────────────────────────────────────────');
    console.log('\n🔑 Credenciales de acceso:');
    console.log('   Email   : admin@hicloud.com');
    console.log('   Password: Admin1234');
    console.log('─────────────────────────────────────────────────\n');

    if (!passwordOk) {
      console.error('❌ ADVERTENCIA: bcrypt.compare falló — posible corrupción del hash.');
      process.exit(1);
    }
  }

  await AppDataSource.destroy();
}

run().catch(err => {
  console.error('\n❌ Error en el seed:', err.message ?? err);
  process.exit(1);
});
