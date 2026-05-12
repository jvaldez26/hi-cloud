/**
 * create-missing-tables.ts
 *
 * Usa TypeORM schemaBuilder.log() para obtener el SQL de creación de
 * tablas faltantes SIN ejecutar nada destructivo (sin DROP, sin ALTER).
 * Luego ejecuta SOLO los CREATE TABLE / CREATE INDEX para tablas que no
 * existen en la BD.
 *
 * Uso: npm run db:create-tables
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MISSING_TABLES = new Set([
  'aprobaciones', 'cajas_chicas', 'movimientos_caja_chica',
  'conduce_detalles', 'conduces', 'conteos_inventario', 'lineas_conteo',
  'credito_cliente', 'cuotas', 'planes_pago', 'depositos_bancarios',
  'reglas_descuento', 'tasas_cambio', 'documentos',
  'saldo_puntos', 'transacciones_puntos',
  'grupos_producto', 'segmentos_cliente',
  'nota_credito_detalles', 'notas_credito',
]);

const AppDataSource = new DataSource({
  type:        'postgres',
  host:        process.env.DB_HOST     ?? 'localhost',
  port:        Number(process.env.DB_PORT ?? 5432),
  username:    process.env.DB_USERNAME ?? 'postgres',
  password:    process.env.DB_PASSWORD ?? '',
  database:    process.env.DB_NAME     ?? 'hicloud',
  ssl:         process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging:     false,
  entities:    [path.resolve(__dirname, '../**/*.entity.{ts,js}')],
});

async function run(): Promise<void> {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  HiCloud ERP — Crear tablas pendientes');
  console.log('════════════════════════════════════════════════════════');

  await AppDataSource.initialize();
  console.log(`  ✅ Conectado: ${process.env.DB_HOST}/${process.env.DB_NAME}`);

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  // Obtener las sentencias SQL que TypeORM necesitaría ejecutar para sincronizar
  const sqlLog = await AppDataSource.driver.createSchemaBuilder().log();

  // Filtrar SOLO las sentencias CREATE TABLE y CREATE INDEX para tablas faltantes
  const createTableSQL: string[] = [];
  const createIndexSQL: string[] = [];

  for (const { query } of sqlLog.upQueries) {
    const q = query.trim().toUpperCase();

    // Solo CREATE TABLE (no ALTER, no DROP)
    if (q.startsWith('CREATE TABLE')) {
      // Verificar que la tabla es una de las que falta
      const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS "([^"]+)"/i)
                      ?? query.match(/CREATE TABLE "([^"]+)"/i);
      const tableName = tableMatch?.[1];
      if (tableName && MISSING_TABLES.has(tableName)) {
        createTableSQL.push(query);
      }
    } else if (q.startsWith('CREATE INDEX') || q.startsWith('CREATE UNIQUE INDEX')) {
      // Índices para tablas faltantes
      const tableMatch = query.match(/ ON "([^"]+)"/i);
      const tableName = tableMatch?.[1];
      if (tableName && MISSING_TABLES.has(tableName)) {
        createIndexSQL.push(query);
      }
    }
    // Ignorar ALTER TABLE, DROP TABLE, etc.
  }

  console.log(`  📋 CREATE TABLE encontrados: ${createTableSQL.length}`);
  console.log(`  📋 CREATE INDEX encontrados:  ${createIndexSQL.length}`);
  console.log('');

  let ok = 0, skip = 0, err = 0;

  // Ejecutar CREATE TABLE
  for (const sql of createTableSQL) {
    const tableMatch = sql.match(/CREATE TABLE[^"]*"([^"]+)"/i);
    const name = tableMatch?.[1] ?? '?';
    try {
      const already = await queryRunner.hasTable(name);
      if (already) { console.log(`  ⏭  ${name} ya existe`); skip++; continue; }
      await queryRunner.query(sql);
      console.log(`  ✅ ${name} creada`);
      ok++;
    } catch (e: any) {
      console.error(`  ❌ ${name}: ${e.message.split('\n')[0]}`);
      err++;
    }
  }

  // Ejecutar CREATE INDEX
  for (const sql of createIndexSQL) {
    try { await queryRunner.query(sql); } catch { /* índice puede ya existir */ }
  }

  await queryRunner.release();
  await AppDataSource.destroy();

  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Creadas: ${ok}  |  Ya existían: ${skip}  |  Errores: ${err}`);
  console.log('════════════════════════════════════════════════════════\n');

  if (err > 0) process.exit(1);
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
