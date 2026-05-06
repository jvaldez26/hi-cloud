import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

interface ModuleStatus { module: string; status: 'OK' | 'ERROR'; detail?: string; ms?: number }

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
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

    // ── 2. Tablas principales (acceso de lectura) ──────────────────
    const tables = [
      'users', 'empresa', 'clientes', 'productos', 'facturas',
      'compras', 'empleados', 'proveedores', 'sucursales',
      'cuentas_por_cobrar', 'cuentas_por_pagar',
      'asientos_contables', 'movimientos_inventario',
    ];

    for (const table of tables) {
      try {
        const t0 = Date.now();
        await this.ds.query(`SELECT COUNT(*) FROM "${table}" LIMIT 1`);
        modules.push({ module: `table:${table}`, status: 'OK', ms: Date.now() - t0 });
      } catch (e: any) {
        modules.push({ module: `table:${table}`, status: 'ERROR', detail: e.message });
      }
    }

    // ── 3. Resumen ─────────────────────────────────────────────────
    const ok     = modules.filter(m => m.status === 'OK').length;
    const errors = modules.filter(m => m.status === 'ERROR');

    return {
      status:  errors.length === 0 ? 'healthy' : errors.some(e => e.module === 'database') ? 'critical' : 'degraded',
      version: '1.0.0',
      uptime:  process.uptime(),
      totalMs: Date.now() - start,
      summary: { ok, errors: errors.length, total: modules.length },
      modules,
    };
  }
}
