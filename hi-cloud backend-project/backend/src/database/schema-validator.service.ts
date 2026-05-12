import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Valida que el esquema de la BD coincida con todas las entidades TypeORM.
 *
 * Distingue dos tipos de problemas:
 *
 * 1. COLUMNA FALTANTE en tabla existente → ERROR crítico.
 *    En PRODUCCIÓN bloquea el arranque porque causaría errores silenciosos
 *    en queries TypeORM (error 42703 que silencia la emisión de e-CFs, etc.)
 *
 * 2. TABLA FALTANTE (módulo nuevo no migrado) → WARN.
 *    El resto del sistema funciona. La tabla se debe crear con
 *    `npm run db:sync` o aplicando la migración SQL correspondiente.
 *
 * Se ejecuta en cada arranque (OnApplicationBootstrap).
 * También expuesto en GET /health para monitoreo.
 */
@Injectable()
export class SchemaValidatorService implements OnApplicationBootstrap {
  private readonly logger = new Logger('SchemaValidator');

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.validate();
  }

  async validate(): Promise<{
    ok:              boolean;
    columnIssues:    string[];
    missingTables:   string[];
  }> {
    const columnIssues:  string[] = [];
    const missingTables: string[] = [];
    const isProd = process.env.NODE_ENV === 'production';

    try {
      // Obtener columnas reales de la BD en una sola query
      const dbColumns: Array<{ table_name: string; column_name: string }> =
        await this.dataSource.query(`
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
        `);

      const dbColSet = new Map<string, Set<string>>();
      for (const row of dbColumns) {
        if (!dbColSet.has(row.table_name)) dbColSet.set(row.table_name, new Set());
        dbColSet.get(row.table_name)!.add(row.column_name);
      }

      const seenTables = new Set<string>();

      for (const meta of this.dataSource.entityMetadatas) {
        const table  = meta.tableName;
        const dbCols = dbColSet.get(table);

        if (!dbCols) {
          if (!seenTables.has(table)) {
            seenTables.add(table);
            missingTables.push(`tabla "${table}" (${meta.name})`);
          }
          continue;
        }

        for (const col of meta.columns) {
          const dbName = col.databaseName;
          if (!dbCols.has(dbName)) {
            columnIssues.push(`[${table}] columna "${dbName}" (entity: ${meta.name})`);
          }
        }
      }

      // ── Columnas faltantes en tablas existentes → CRÍTICO ──────────────────
      if (columnIssues.length > 0) {
        this.logger.error('');
        this.logger.error('╔══════════════════════════════════════════════════════╗');
        this.logger.error('║   ⛔  COLUMNAS FALTANTES EN BD — CRÍTICO  ⛔         ║');
        this.logger.error('╚══════════════════════════════════════════════════════╝');
        this.logger.error('  Las siguientes columnas existen en el entity TypeORM');
        this.logger.error('  pero NO en la BD. Causarán errores 42703 silenciosos:');
        this.logger.error('');
        columnIssues.forEach(issue => this.logger.error(`  ✗ ${issue}`));
        this.logger.error('');
        this.logger.error('  → SOLUCIÓN RÁPIDA (aplica todas las migraciones pendientes):');
        this.logger.error('    psql -d hicloud -f src/seeds/MIGRAR-TODO-2026-05-09.sql');
        this.logger.error('  → O desde Node.js:');
        this.logger.error('    node scripts/apply-migrations.js');
        this.logger.error('══════════════════════════════════════════════════════');

        if (isProd) {
          throw new Error(
            `Schema crítico: ${columnIssues.length} columna(s) faltante(s) en BD. ` +
            `El servidor no puede arrancar. Ejecuta la migración.`,
          );
        }
      }

      // ── Tablas faltantes (módulos nuevos) → WARN no crítico ─────────────────
      if (missingTables.length > 0) {
        this.logger.warn(
          `Schema: ${missingTables.length} tabla(s) aún no creadas en BD ` +
          `(módulos nuevos). Ejecuta "npm run db:sync" para crearlas. ` +
          `Ejemplo: ${missingTables.slice(0, 3).join(', ')}${missingTables.length > 3 ? '...' : ''}`,
        );
      }

      // ── Todo OK ─────────────────────────────────────────────────────────────
      if (columnIssues.length === 0 && missingTables.length === 0) {
        this.logger.log(
          `✅ Schema BD validado — ${this.dataSource.entityMetadatas.length} entidades OK`,
        );
      } else if (columnIssues.length === 0) {
        this.logger.log(
          `✅ Schema crítico OK — solo ${missingTables.length} tabla(s) de módulos nuevos pendientes`,
        );
      }

    } catch (err: any) {
      if (err.message?.startsWith('Schema crítico')) throw err;
      this.logger.error(`No se pudo validar schema: ${err.message}`);
      if (isProd) throw err;
    }

    return {
      ok:            columnIssues.length === 0,
      columnIssues,
      missingTables,
    };
  }
}
