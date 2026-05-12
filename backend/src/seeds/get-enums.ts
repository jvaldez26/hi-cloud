import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false, logging: false,
  entities: [path.resolve(__dirname, '../**/*.entity.{ts,js}')],
});

ds.initialize().then(async () => {
  const log = await ds.driver.createSchemaBuilder().log();
  const enumSQL = log.upQueries.map(q => q.query).filter(q => q.trim().toUpperCase().startsWith('CREATE TYPE'));
  console.log(JSON.stringify(enumSQL, null, 2));
  await ds.destroy();
}).catch(e => { console.error(e.message); process.exit(1); });
