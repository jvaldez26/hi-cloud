/**
 * generate-migration.js
 * Helper para generar SQL de migración con el naming correcto (camelCase).
 *
 * Uso: node scripts/generate-migration.js
 *
 * Lee las entidades TypeORM y genera el ALTER TABLE con el nombre exacto
 * de la propiedad TypeScript (camelCase), respetando la convención del proyecto.
 *
 * REGLA CRÍTICA — LEER ANTES DE CUALQUIER MIGRACIÓN:
 * ═══════════════════════════════════════════════════════
 * TypeORM SIN NamingStrategy mapea la propiedad TypeScript directamente
 * al nombre de columna en la DB. NO convierte camelCase → snake_case.
 *
 * ✅ SIEMPRE escribir migrations así:
 *    ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "tipoSociedad" VARCHAR(50);
 *    ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "cedulaRepresentante" VARCHAR(13);
 *
 * ❌ NUNCA escribir así (causará "columna no existe" en TypeORM):
 *    ALTER TABLE empresa ADD COLUMN IF NOT EXISTS tipo_sociedad VARCHAR(50);
 *    ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cedula_representante VARCHAR(13);
 *
 * Verificar SIEMPRE con: node scripts/validate-schema.js
 * ═══════════════════════════════════════════════════════
 */
'use strict';

// Template de migration SQL correcto
function generateMigration(tableName, columns) {
  const lines = columns.map(({ name, type, extra = '' }) =>
    `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${name}" ${type}${extra ? ' ' + extra : ''};`
  );
  return `-- Migration: ${tableName}\n-- Generado: ${new Date().toISOString().split('T')[0]}\n-- NOTA: columnas en camelCase (coincide con propiedad TypeScript)\n\n${lines.join('\n')}`;
}

// Ejemplos de uso
const examples = [
  {
    description: 'Agregar campos a empresa',
    sql: generateMigration('empresa', [
      { name: 'tipoSociedad',      type: 'VARCHAR(50)',  extra: '' },
      { name: 'cedulaRepresentante',type:'VARCHAR(13)',  extra: '' },
      { name: 'direccion2',        type: 'VARCHAR(200)', extra: '' },
      { name: 'telefonoSecundario',type: 'VARCHAR(20)',  extra: '' },
      { name: 'favicon',           type: 'TEXT',         extra: '' },
      { name: 'configuracion',     type: 'JSONB',        extra: "DEFAULT '{}'" },
    ]),
  },
  {
    description: 'Agregar empresaId a módulo legacy',
    sql: generateMigration('nueva_tabla', [
      { name: 'empresaId', type: 'INTEGER', extra: '' },
    ]) + '\nCREATE INDEX IF NOT EXISTS "idx_nueva_tabla_empresaId" ON "nueva_tabla"("empresaId");',
  },
];

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  GENERADOR DE MIGRATIONS — HiCloud ERP                       ║');
console.log('║  Regla: siempre camelCase en nombres de columna              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (const ex of examples) {
  console.log(`── ${ex.description} ──`);
  console.log(ex.sql);
  console.log();
}

console.log('Para validar schema después de migrar:');
console.log('  node scripts/validate-schema.js\n');
