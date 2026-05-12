/**
 * HiCloud ERP — Sync seguro de columnas faltantes
 * Compara entidades TypeORM con el schema real de la BD y agrega SOLO
 * las columnas que faltan, sin tocar constraints ni índices.
 *
 * Uso: npm run db:sync
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Tablas que NO se deben modificar (globales o con schema especial)
const SKIP_TABLES = new Set([
  'empresa',          // tiene schema propio, no tocar
  'users',            // tabla global
  'usuario_empresa',  // tabla de vínculos, ya correcta
  'configuraciones_sistema',
  'demo_requests',
  'tipos_ecf',
  'invitaciones',
  'suscripciones',
]);

const useSSL = process.env.DB_SSL === 'true';
const AppDataSource = new DataSource({
  type:        'postgres',
  host:        process.env.DB_HOST     ?? 'localhost',
  port:        Number(process.env.DB_PORT ?? 5432),
  username:    process.env.DB_USERNAME ?? 'postgres',
  password:    process.env.DB_PASSWORD ?? '',
  database:    process.env.DB_NAME     ?? 'hicloud',
  ssl:         useSSL ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging:     false,
  entities:    [path.resolve(__dirname, '../**/*.entity.{ts,js}')],
});

async function sync(): Promise<void> {
  console.log('\n🔄 HiCloud ERP — Sync de columnas faltantes\n');
  await AppDataSource.initialize();
  console.log('✅ Conectado a la BD\n');

  const em = AppDataSource.createEntityManager();
  let colsAdded = 0;

  // Obtener todos los metadatos de entidades registradas
  const entityMetadatas = AppDataSource.entityMetadatas;

  for (const meta of entityMetadatas) {
    const tableName = meta.tableName;
    if (SKIP_TABLES.has(tableName)) continue;

    // Verificar que la tabla existe
    const tableExists = await em.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [tableName],
    );
    if (!tableExists.length) continue;  // Tabla aún no creada

    // Obtener columnas actuales de la BD
    const dbCols: { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[] =
      await em.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1`,
        [tableName],
      );
    const dbColNames = new Set(dbCols.map(c => c.column_name));

    // Columnas declaradas en el entity
    for (const col of meta.columns) {
      const colName = col.databaseName;
      if (dbColNames.has(colName)) continue;  // Ya existe

      // Determinar el tipo SQL
      let sqlType = 'text';
      const dt = col.type?.toString().toLowerCase() ?? '';

      if (dt.includes('int') || dt === 'number') {
        if (col.precision && col.scale !== undefined) {
          sqlType = `numeric(${col.precision},${col.scale})`;
        } else {
          sqlType = 'integer';
        }
      } else if (dt === 'decimal' || dt === 'numeric') {
        sqlType = `numeric(${col.precision ?? 14},${col.scale ?? 2})`;
      } else if (dt === 'boolean' || dt === 'bool') {
        sqlType = 'boolean';
      } else if (dt === 'date') {
        sqlType = 'date';
      } else if (dt === 'timestamp' || dt.includes('datetime')) {
        sqlType = 'TIMESTAMP';
      } else if (dt === 'text') {
        sqlType = 'text';
      } else if (dt === 'character varying' || dt === 'varchar' || dt === 'string') {
        sqlType = col.length ? `character varying(${col.length})` : 'character varying(255)';
      } else if (dt === 'jsonb') {
        sqlType = 'jsonb';
      } else if (dt === 'json') {
        sqlType = 'json';
      } else if (col.length) {
        sqlType = `character varying(${col.length})`;
      }

      // NULL/DEFAULT
      const nullable  = col.isNullable !== false ? '' : ' DEFAULT NULL';
      const hasDefault = col.default !== undefined && col.default !== null;
      const defaultVal = hasDefault ? ` DEFAULT ${col.default}` : (col.isNullable !== false ? '' : '');

      try {
        await em.query(
          `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${colName}" ${sqlType}${defaultVal}`,
        );
        console.log(`  ✅ ${tableName}.${colName} (${sqlType})`);
        colsAdded++;
      } catch (e: any) {
        console.log(`  ⚠️  ${tableName}.${colName} — ${e.message.split('\n')[0]}`);
      }
    }
  }

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`✅ ${colsAdded} columna(s) agregadas`);
  console.log('─────────────────────────────────────────────\n');

  await AppDataSource.destroy();
}

sync().catch(err => {
  console.error('\n❌ Error en sync:', err.message ?? err);
  process.exit(1);
});
