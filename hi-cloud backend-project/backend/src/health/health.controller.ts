import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { SchemaValidatorService } from '../database/schema-validator.service';
import { QueuesService } from '../queues/queues.service';

interface ModuleStatus { module: string; status: 'OK' | 'ERROR'; detail?: string; ms?: number }

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    private readonly schemaValidator: SchemaValidatorService,
    @Optional() private readonly queues: QueuesService,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check completo del sistema' })
  async check() {
    const start = Date.now();
    const modules: ModuleStatus[] = [];

    // ── 1. Base de datos ───────────────────────────────────────────
    try {
      const t0 = Date.now();
      await this.ds.query('SELECT 1');
      modules.push({ module: 'database', status: 'OK', ms: Date.now() - t0 });
    } catch (e: any) {
      modules.push({ module: 'database', status: 'ERROR', detail: e.message });
    }

    // ── 2. Schema drift — verifica que entidades y BD estén en sync ─
    try {
      const t0 = Date.now();
      const { ok, columnIssues, missingTables } = await this.schemaValidator.validate();
      const detail = [
        columnIssues.length  > 0 ? `${columnIssues.length} columna(s) críticas faltantes`   : '',
        missingTables.length > 0 ? `${missingTables.length} tabla(s) de módulos sin migrar` : '',
      ].filter(Boolean).join('; ');
      modules.push({
        module: 'schema',
        status: ok ? 'OK' : 'ERROR',
        ms:     Date.now() - t0,
        ...(detail ? { detail } : {}),
        ...(columnIssues.length > 0 ? { columnIssues } : {}),
        ...(missingTables.length > 0 ? { missingTables } : {}),
      } as any);
    } catch (e: any) {
      modules.push({ module: 'schema', status: 'ERROR', detail: e.message });
    }

    // ── 3. Tablas principales (acceso de lectura) ──────────────────
    const tables = [
      'users', 'empresa', 'clientes', 'productos', 'facturas',
      'compras', 'empleados', 'proveedores', 'sucursales',
      'cuentas_por_cobrar', 'cuentas_por_pagar',
      'asientos_contables', 'movimientos_inventario',
    ];

    for (const table of tables) {
      try {
        const t0 = Date.now();
        // Escape de comillas para evitar inyección si la lista cambia en el futuro
        const safeTable = table.replace(/"/g, '""');
        await this.ds.query(`SELECT COUNT(*) FROM "${safeTable}" LIMIT 1`);
        modules.push({ module: `table:${table}`, status: 'OK', ms: Date.now() - t0 });
      } catch (e: any) {
        modules.push({ module: `table:${table}`, status: 'ERROR', detail: e.message });
      }
    }

    // ── 4. Redis Cache ────────────────────────────────────────────
    try {
      const t0 = Date.now();
      if (this.cache) {
        const testKey = '__health_check__';
        await this.cache.set(testKey, 1, 5000);
        await this.cache.del(testKey);
        modules.push({ module: 'cache', status: 'OK', ms: Date.now() - t0, detail: 'operacional' });
      } else {
        modules.push({ module: 'cache', status: 'OK', detail: 'in-memory (sin Redis)' });
      }
    } catch (e: any) {
      modules.push({ module: 'cache', status: 'ERROR', detail: e.message });
    }

    // ── 5. Colas BullMQ ───────────────────────────────────────────
    try {
      if (this.queues) {
        // Timeout de 2s para no bloquear si Redis no está disponible
        const qStatus = await Promise.race([
          this.queues.getStatus(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
        ]);
        const activas = qStatus.filter((q: any) => q.activa).length;
        modules.push({
          module: 'queues',
          status: 'OK',
          detail: `${activas}/${qStatus.length} colas activas`,
        });
      } else {
        modules.push({ module: 'queues', status: 'OK', detail: 'no configuradas' });
      }
    } catch (e: any) {
      const detail = e.message === 'timeout'
        ? 'Redis no disponible (sin REDIS_URL)'
        : e.message;
      modules.push({ module: 'queues', status: 'ERROR', detail });
    }

    // ── 6. Connection Pool ────────────────────────────────────────
    try {
      const pool = await this.ds.query(
        `SELECT count(*) as total, count(*) filter(where state='active') as active,
                count(*) filter(where state='idle') as idle
         FROM pg_stat_activity WHERE datname = current_database()`,
      );
      const p = pool[0];
      modules.push({
        module: 'db-pool',
        status: 'OK',
        detail: `total=${p.total} active=${p.active} idle=${p.idle}`,
      });
    } catch {
      modules.push({ module: 'db-pool', status: 'ERROR' });
    }

    // ── 7. Resumen ────────────────────────────────────────────────
    const ok     = modules.filter(m => m.status === 'OK').length;
    const errors = modules.filter(m => m.status === 'ERROR');

    return {
      status:  errors.length === 0 ? 'healthy'
             : errors.some(e => ['database','schema'].includes(e.module)) ? 'critical'
             : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      env:     process.env.NODE_ENV ?? 'development',
      uptime:  Math.round(process.uptime()),
      totalMs: Date.now() - start,
      summary: { ok, errors: errors.length, total: modules.length },
      modules,
      memory: {
        heapUsedMB:  Math.round(process.memoryUsage().heapUsed  / 1024 / 1024),
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rssMB:       Math.round(process.memoryUsage().rss       / 1024 / 1024),
      },
    };
  }
}
