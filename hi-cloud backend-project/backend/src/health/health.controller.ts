import { Controller, Get, Inject, Optional, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
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
    @Optional() @InjectRepository(UsuarioEmpresa) private readonly ueRepo: Repository<UsuarioEmpresa>,
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

  @Get('mis-empresas/:userId')
  @ApiOperation({ summary: 'Debug: ejecuta exactamente el mismo query que mis-empresas' })
  async debugMisEmpresas(@Param('userId') userId: string) {
    const id = Number(userId);
    // Ejecutar la misma lógica que getEmpresasDeUsuario
    const qb = this.ueRepo
      ? this.ueRepo
          .createQueryBuilder('ue')
          .leftJoinAndSelect('ue.empresa', 'e')
          .where({ userId: id })
          .andWhere('ue.isActive IS NOT FALSE')
          .orderBy('ue.isPrincipal', 'DESC')
      : null;
    const sql    = qb?.getSql() ?? 'ueRepo no disponible';
    const result = qb ? await qb.getMany() : [];
    // Raw SQL para comparar
    const rawResult = await this.ds.query(
      `SELECT ue.*, e.nombre as empresa_nombre, e."isActive" as e_isactive
       FROM usuario_empresa ue
       LEFT JOIN empresa e ON e.id = ue."empresaId"
       WHERE ue."userId" = $1 AND (ue."isActive" IS NOT FALSE)`,
      [id],
    );
    return {
      userId: id,
      queryBuilder_sql:    sql,
      queryBuilder_count:  result.length,
      queryBuilder_result: result.map(r => ({ empresaId: r.empresaId, nombre: r.empresa?.nombre, isActive: r.isActive })),
      raw_sql_count:       rawResult.length,
      raw_sql_result:      rawResult,
    };
  }

  @Get('db-isactive')
  @ApiOperation({ summary: 'Diagnóstico: distribución isActive en empresa y usuario_empresa' })
  async checkIsActive() {
    const [empresaRows, ueRows, migrations, jeanRows] = await Promise.all([
      this.ds.query(`SELECT "isActive"::text, COUNT(*) FROM empresa GROUP BY "isActive"`),
      this.ds.query(`SELECT "isActive"::text, COUNT(*) FROM usuario_empresa GROUP BY "isActive"`),
      this.ds.query(`SELECT name FROM typeorm_migrations ORDER BY timestamp DESC LIMIT 5`),
      // Registros detallados de JEAN + test IS NOT FALSE
      this.ds.query(`
        SELECT u.id as userId, u.email,
               ue.id as ueId, ue."empresaId", ue."isActive" as ue_isActive,
               ue."isPrincipal",
               e.nombre as empresa_nombre, e."isActive" as e_isActive,
               (ue."isActive" IS NOT FALSE) as pasa_filtro
        FROM users u
        LEFT JOIN usuario_empresa ue ON ue."userId" = u.id
        LEFT JOIN empresa e ON e.id = ue."empresaId"
        WHERE u.email = 'valdezsamuel03@gmail.com'
        ORDER BY ue."isPrincipal" DESC
      `),
    ]);
    const pasanFiltro = jeanRows.filter((r: any) => r.pasa_filtro);
    return { empresa: empresaRows, usuario_empresa: ueRows, migrations, jean: jeanRows, jean_pasan_filtro: pasanFiltro.length };
  }
}
