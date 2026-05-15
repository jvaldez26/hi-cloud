/**
 * DataSource para TypeORM CLI (migrations).
 *
 * Uso:
 *   npm run migration:generate -- src/migrations/NombreMigracion
 *   npm run migration:run
 *   npm run migration:revert
 *   npm run migration:show
 *
 * REGLA: siempre commitear el archivo de migración generado junto
 * con los cambios de entidad. El deploy lo aplica automáticamente.
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { readFileSync, existsSync } from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const certVal = process.env.DB_CA_CERT;
const ssl = certVal
  ? { rejectUnauthorized: true, ca: existsSync(certVal) ? readFileSync(certVal, 'utf8') : Buffer.from(certVal, 'base64').toString('utf-8') }
  : process.env.DB_SSL === 'true' ? { rejectUnauthorized: false }
  : false;

export const AppDataSource = new DataSource({
  type:       'postgres',
  host:       process.env.DB_HOST     ?? 'localhost',
  port:       Number(process.env.DB_PORT ?? 5432),
  username:   process.env.DB_USERNAME ?? 'postgres',
  password:   process.env.DB_PASSWORD ?? '',
  database:   process.env.DB_NAME     ?? 'hicloud',
  ssl,

  // CLI usa dist/ para migration:run (código compilado)
  entities:   ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],

  synchronize:   false,
  migrationsRun: false,
  logging:       ['migration'],

  // Nombre de la tabla donde TypeORM registra migraciones aplicadas
  migrationsTableName: 'typeorm_migrations',
});
