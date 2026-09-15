import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ModulosAddonService {
  private readonly logger = new Logger(ModulosAddonService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  async checkModuloActivo(empresaId: number, codigo: string): Promise<boolean> {
    const rows = await this.ds.query<any[]>(
      `SELECT 1 FROM empresa_modulos
       WHERE "empresaId" = $1 AND "moduloCodigo" = $2
         AND activo = true
         AND ("fechaVencimiento" IS NULL OR "fechaVencimiento" > NOW())
       LIMIT 1`,
      [empresaId, codigo],
    );
    return rows.length > 0;
  }

  async listarModulos() {
    return this.ds.query<any[]>(
      `SELECT id, codigo, nombre, descripcion, "activacionAutomatica"
       FROM modulos_addon WHERE "isActive" = true ORDER BY nombre`,
    );
  }

  async getModulosEmpresa(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT em.id, em."moduloCodigo", em.activo, em."fechaActivacion", em."fechaVencimiento", em.notas,
              em.origen, em."esCortesia",
              ma.nombre, ma.descripcion
       FROM empresa_modulos em
       JOIN modulos_addon ma ON ma.codigo = em."moduloCodigo"
       WHERE em."empresaId" = $1
       ORDER BY ma.nombre`,
      [empresaId],
    );
  }

  async activarModulo(
    empresaId: number,
    codigo: string,
    activadoPor: number,
    fechaVencimiento?: string | null,
    notas?: string,
    origen: string = 'manual',
    esCortesia = false,
  ) {
    const modulo = await this.ds.query<any[]>(
      `SELECT 1 FROM modulos_addon WHERE codigo = $1 AND "isActive" = true`,
      [codigo],
    );
    if (!modulo.length) throw new NotFoundException(`Módulo '${codigo}' no existe`);

    await this.ds.query(
      `INSERT INTO empresa_modulos ("empresaId", "moduloCodigo", activo, "activadoPor", "fechaVencimiento", notas, "fechaActivacion", origen, "esCortesia")
       VALUES ($1, $2, true, $3, $4, $5, NOW(), $6, $7)
       ON CONFLICT ("empresaId", "moduloCodigo")
       DO UPDATE SET activo = true, "activadoPor" = $3, "fechaVencimiento" = $4, notas = $5, origen = $6, "esCortesia" = $7, "updatedAt" = NOW()`,
      [empresaId, codigo, activadoPor, fechaVencimiento ?? null, notas ?? null, origen, esCortesia],
    );
    this.logger.log(`Módulo '${codigo}' activado para empresa #${empresaId} por usuario #${activadoPor} (origen=${origen}${esCortesia ? ', cortesía' : ''})`);
    return { ok: true, message: `Módulo '${codigo}' activado` };
  }

  /** Flag por add-on, configurable desde Super Admin — ver activacionAutomatica en ModuloAddon. */
  async setActivacionAutomatica(codigo: string, activacionAutomatica: boolean) {
    const res = await this.ds.query(
      `UPDATE modulos_addon SET "activacionAutomatica" = $1, "updatedAt" = NOW() WHERE codigo = $2`,
      [activacionAutomatica, codigo],
    );
    if (!res[1]) throw new NotFoundException(`Módulo '${codigo}' no existe`);
    this.logger.log(`Activación automática de '${codigo}' → ${activacionAutomatica}`);
    return { ok: true, codigo, activacionAutomatica };
  }

  async desactivarModulo(empresaId: number, codigo: string) {
    await this.ds.query(
      `UPDATE empresa_modulos SET activo = false, "updatedAt" = NOW()
       WHERE "empresaId" = $1 AND "moduloCodigo" = $2`,
      [empresaId, codigo],
    );
    this.logger.log(`Módulo '${codigo}' desactivado para empresa #${empresaId}`);
    return { ok: true, message: `Módulo '${codigo}' desactivado` };
  }

  async checkModuloActivoCurrentEmpresa(codigo: string): Promise<boolean> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.checkModuloActivo(empresaId, codigo);
  }

  async getMisModulosActivos(): Promise<string[]> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rows = await this.ds.query<any[]>(
      `SELECT "moduloCodigo" FROM empresa_modulos
       WHERE "empresaId" = $1 AND activo = true
         AND ("fechaVencimiento" IS NULL OR "fechaVencimiento" > NOW())`,
      [empresaId],
    );
    return rows.map((r: any) => r.moduloCodigo);
  }

  async getActivacionesGlobal() {
    const [activaciones, modulos] = await Promise.all([
      this.ds.query<any[]>(`
        SELECT em."empresaId", e.nombre AS "empresaNombre",
               em."moduloCodigo", ma.nombre AS "moduloNombre",
               em.activo, em."fechaActivacion", em."fechaVencimiento",
               em.notas, em.origen, em."esCortesia", u.nombre AS "activadoPorNombre"
        FROM empresa_modulos em
        JOIN empresa e ON e.id = em."empresaId"
        JOIN modulos_addon ma ON ma.codigo = em."moduloCodigo"
        LEFT JOIN users u ON u.id = em."activadoPor"
        WHERE em.activo = true
        ORDER BY em."fechaActivacion" DESC
      `),
      this.listarModulos(),
    ]);
    const resumen = modulos.map((m: any) => ({
      ...m,
      empresasActivas: activaciones.filter((a: any) => a.moduloCodigo === m.codigo).length,
    }));
    return { resumen, activaciones };
  }
}
