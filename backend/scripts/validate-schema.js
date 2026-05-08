/**
 * validate-schema.js
 * Compara las columnas definidas en las entidades TypeORM con las columnas
 * reales de la base de datos. Si hay diferencias, las reporta y sale con código 1.
 *
 * Uso: node scripts/validate-schema.js
 * Agregar como paso en CI/CD o antes de npm run build
 */
'use strict';

require('dotenv').config();
const { Client } = require('pg');

// ── Configuración de la conexión ──────────────────────────────────────────────
const client = new Client({
  host:     process.env.DB_HOST     || 'hicloud-db.cjc0a822i31y.us-east-2.rds.amazonaws.com',
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'hicloud',
  user:     process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Higlobal-4691',
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// ── Tablas y columnas que DEBEN existir (extraídas de las entidades TypeORM) ──
//
// REGLA CRÍTICA: TypeORM sin NamingStrategy usa el nombre exacto de la
// propiedad TypeScript como nombre de columna en la DB.
// → SIEMPRE usar camelCase en SQL migrations.
//
// ❌ INCORRECTO: ADD COLUMN tipo_sociedad VARCHAR(50)
// ✅ CORRECTO:   ADD COLUMN "tipoSociedad" VARCHAR(50)
//
const REQUIRED_COLUMNS = {
  // ── Core ────────────────────────────────────────────────────────────────────
  empresa: [
    'id','isActive','createdAt','updatedAt',
    'rnc','nombre','nombreComercial','direccion','ciudad','provincia',
    'telefono','email','sitioWeb','logo','regimenFiscal','representanteLegal',
    'fechaConstitucion','actividadEconomica','codigoPostal','moneda','zonaHoraria',
    'sector',
    // Columnas añadidas en mayo 2026 — deben estar en camelCase
    'tipoSociedad','cedulaRepresentante','direccion2','telefonoSecundario',
    'favicon','configuracion',
  ],
  users: [
    'id','isActive','createdAt','updatedAt',
    'nombre','email','password','role',
    'resetPasswordToken','resetPasswordExpires',
    'twoFactorEnabled','twoFactorSecret',
  ],
  // ── Operaciones ──────────────────────────────────────────────────────────────
  proveedores: [
    'id','isActive','createdAt','updatedAt','empresaId',
    'nombre','rnc','telefono','email','direccion','contacto','notas',
    'categoria','diasPago','banco','cuentaBancaria',
  ],
  clientes: [
    'id','isActive','createdAt','updatedAt','empresaId',
    'nombre','rfc','email','telefono','direccion','ciudad','regimenFiscal',
  ],
  facturas: [
    'id','isActive','createdAt','updatedAt','empresaId',
    'folio','fecha','estado','subtotal','iva','total',
    'clienteId','usuarioId','moneda','notas',
  ],
  compras: [
    'id','isActive','createdAt','updatedAt','empresaId',
    'folio','fecha','estado','subtotal','itbis','total','proveedorId',
  ],
  // ── Multi-tenant (módulos corregidos en mayo 2026) ────────────────────────
  encuestas: [
    'id','createdAt','updatedAt','empresaId',
    'titulo','tipo','descripcion','preguntas','activa','tokenPublico',
  ],
  cursos_capacitacion: [
    'id','createdAt','updatedAt','empresaId',
    'nombre','descripcion','categoria','instructor','duracionHoras','modalidad','activo',
  ],
  terminales_datafono: [
    'id','createdAt','updatedAt','empresaId',
    'numeroTerminal','banco','tipoTarjeta','sucursal','comisionPct','activo',
  ],
};

// ── Columnas que NO deben existir (snake_case duplicadas) ──────────────────────
const FORBIDDEN_COLUMNS = {
  empresa:               ['tipo_sociedad','cedula_representante','telefono_secundario'],
  proveedores:           ['dias_pago','cuenta_bancaria'],
  encuestas:             ['empresa_id'],
  respuestas_encuesta:   ['empresa_id'],
  cursos_capacitacion:   ['empresa_id'],
  sesiones_capacitacion: ['empresa_id'],
  registros_capacitacion:['empresa_id'],
  terminales_datafono:   ['empresa_id'],
  transacciones_tarjeta: ['empresa_id'],
  conciliaciones_datafono:['empresa_id'],
};

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await client.connect();
  console.log('🔍 Validando schema de la base de datos contra entidades TypeORM...\n');

  let errors   = 0;
  let warnings = 0;

  // 1. Verificar columnas REQUERIDAS
  console.log('── Columnas requeridas ────────────────────────────────────────');
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]
    );
    const existing = new Set(rows.map(r => r.column_name));
    const missing  = cols.filter(c => !existing.has(c));

    if (missing.length > 0) {
      console.error(`❌ TABLA "${table}" — columnas FALTANTES: ${missing.join(', ')}`);
      console.error(`   → Ejecuta: ALTER TABLE "${table}" ADD COLUMN "${missing[0]}" ...`);
      errors += missing.length;
    } else {
      console.log(`✅ ${table}`);
    }
  }

  // 2. Verificar columnas PROHIBIDAS (snake_case que no deberían existir)
  console.log('\n── Columnas prohibidas (snake_case en tabla camelCase) ──────');
  for (const [table, cols] of Object.entries(FORBIDDEN_COLUMNS)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]
    );
    const existing  = new Set(rows.map(r => r.column_name));
    const forbidden = cols.filter(c => existing.has(c));

    if (forbidden.length > 0) {
      console.warn(`⚠️  TABLA "${table}" — columnas snake_case encontradas: ${forbidden.join(', ')}`);
      console.warn(`   → Estas causan "columna no existe" en TypeORM. Renombrar o eliminar.`);
      warnings += forbidden.length;
    }
  }

  // 3. Resumen
  console.log('\n══════════════════════════════════════════════════════════════');
  if (errors === 0 && warnings === 0) {
    console.log('✅ Schema válido — todas las columnas coinciden con las entidades TypeORM.');
  } else {
    if (errors > 0)   console.error(`❌ ${errors} columna(s) FALTANTE(S) — el backend FALLARÁ al iniciar.`);
    if (warnings > 0) console.warn( `⚠️  ${warnings} columna(s) prohibida(s) — pueden causar errores en runtime.`);
    console.log('\n📖 REGLA: TypeORM sin NamingStrategy → columnas en camelCase en la DB.');
    console.log('   ❌ ADD COLUMN tipo_sociedad    ← INCORRECTO');
    console.log('   ✅ ADD COLUMN "tipoSociedad"   ← CORRECTO');
  }

  await client.end();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
