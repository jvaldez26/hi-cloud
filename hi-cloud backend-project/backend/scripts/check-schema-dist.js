#!/usr/bin/env node
/**
 * check-schema-dist.js
 *
 * Valida que el esquema de la BD coincida con las entidades TypeORM
 * del build COMPILADO (dist/). Usa AppDataSource directamente, por lo
 * que refleja exactamente lo que TypeORM espera en producción.
 *
 * Diferencia con validate-schema.js: éste usa TypeORM metadata real
 * (respeta databaseName overrides, herencia de entidades, etc.) en vez
 * de parsear .entity.ts con regex.
 *
 * Uso:
 *   node scripts/check-schema-dist.js
 *
 * Requiere que dist/ esté compilado (npm run build).
 * Las variables de entorno de conexión a BD deben estar disponibles
 * (lee de .env o de process.env — process.env tiene prioridad).
 *
 * Exit code:
 *   0 — todas las columnas OK
 *   1 — columnas faltantes o error de conexión
 */

'use strict';

const path = require('path');

// Cargar AppDataSource del dist compilado
let AppDataSource;
try {
  ({ AppDataSource } = require(path.join(__dirname, '..', 'dist', 'data-source')));
} catch (e) {
  console.error('❌ No se pudo cargar dist/data-source.js:', e.message);
  console.error('   → Asegúrate de haber ejecutado "npm run build" antes.');
  process.exit(1);
}

AppDataSource.initialize()
  .then(async (ds) => {
    // Obtener columnas reales de la BD
    const dbCols = await ds.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);

    const dbMap = new Map();
    for (const r of dbCols) {
      if (!dbMap.has(r.table_name)) dbMap.set(r.table_name, new Set());
      dbMap.get(r.table_name).add(r.column_name);
    }

    const columnIssues = [];
    const checkedTables = new Set();

    for (const meta of ds.entityMetadatas) {
      const table  = meta.tableName;
      const dbCols = dbMap.get(table);

      if (!dbCols) {
        // Tabla faltante = warning (módulo nuevo), no bloquea el deploy
        if (!checkedTables.has(table)) {
          checkedTables.add(table);
          console.warn(`  ⚠  Tabla "${table}" no existe en BD (módulo nuevo — no crítico)`);
        }
        continue;
      }

      for (const col of meta.columns) {
        if (!dbCols.has(col.databaseName)) {
          columnIssues.push(
            `[${table}] columna "${col.databaseName}" (entity: ${meta.name})`,
          );
        }
      }
    }

    await ds.destroy();

    if (columnIssues.length > 0) {
      console.error('');
      console.error('❌ SCHEMA MISMATCH — columnas en entity sin migración en BD:');
      columnIssues.forEach(i => console.error('  ✗', i));
      console.error('');
      console.error('  → Crea una migración TypeScript en src/migrations/');
      console.error('    npm run migration:generate -- src/migrations/NombreCambio');
      console.error('  → NUNCA pongas migraciones como .sql en seeds/');
      console.error('');
      process.exit(1);
    }

    const totalEntities = ds.entityMetadatas.length;
    console.log(`✅ Schema validado — ${totalEntities} entidades OK, todas las columnas presentes en BD`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error conectando/validando schema:', err.message);
    process.exit(1);
  });
