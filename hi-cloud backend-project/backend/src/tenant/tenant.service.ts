import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { SKIP_TENANT_KEY, SKIP_TENANT_CALLER } from './tenant.subscriber';
import { TenantAwareRepository } from './tenant-aware.repository';

const TENANT_KEY   = 'empresaId';
const USER_KEY     = 'userId';
const ROL_KEY      = 'rolEmpresa';
const SUCURSAL_KEY = 'sucursalId';
const ALMACEN_KEY  = 'almacenId';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly cls: ClsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ── Contexto de empresa ───────────────────────────────────────────────────

  /** Retorna el empresaId del request actual. Lanza 403 si no está establecido. */
  getEmpresaId(): number {
    const id = this.cls.get<number>(TENANT_KEY);
    if (!id) throw new ForbiddenException('Se requiere contexto de empresa. Realiza login o cambia de empresa activa.');
    return id;
  }

  getEmpresaIdOrNull(): number | null {
    return this.cls.get<number>(TENANT_KEY) ?? null;
  }

  setEmpresaId(id: number): void  { this.cls.set(TENANT_KEY, id); }
  getUserId(): number | null      { return this.cls.get<number>(USER_KEY) ?? null; }
  setUserId(id: number): void     { this.cls.set(USER_KEY, id); }
  getRolEmpresa(): string | null  { return this.cls.get<string>(ROL_KEY) ?? null; }
  setRolEmpresa(rol: string): void { this.cls.set(ROL_KEY, rol); }

  getSucursalId(): number | null  { return this.cls.get<number>(SUCURSAL_KEY) ?? null; }
  setSucursalId(id: number): void { this.cls.set(SUCURSAL_KEY, id); }
  getAlmacenId(): number | null   { return this.cls.get<number>(ALMACEN_KEY) ?? null; }
  setAlmacenId(id: number): void  { this.cls.set(ALMACEN_KEY, id); }

  // ── QB helper tenant-aware ────────────────────────────────────────────────

  /**
   * Reemplaza repo.createQueryBuilder(alias) para entidades con empresaId.
   * Inyecta automáticamente WHERE alias.empresaId = :eid.
   * Lanza ForbiddenException si no hay contexto de empresa.
   * Si withoutTenantScope() está activo, permite y logea.
   *
   * USO:
   *   this.tenantService.qb(this.cxcRepository, 'c')
   *     .andWhere('c.estado = :e', { e: 'pendiente' })
   *     ...
   */
  qb<T extends ObjectLiteral>(repo: Repository<T>, alias: string): SelectQueryBuilder<T> {
    const metadata = this.dataSource.getMetadata(repo.target);
    const hasEmpresaId = metadata.columns.some(c => c.propertyName === 'empresaId');

    const qb = repo.createQueryBuilder(alias);
    if (!hasEmpresaId) return qb;

    if (this.cls.get<boolean>(SKIP_TENANT_KEY)) {
      const caller = this.cls.get<string>(SKIP_TENANT_CALLER) ?? 'unknown';
      this.logger.warn(`[TenantScope] QB cross-tenant AUTORIZADO sobre ${metadata.name} — caller: ${caller}`);
      return qb;
    }

    const eid = this.cls.get<number>(TENANT_KEY);
    if (!eid) {
      throw new ForbiddenException(
        `[TenantScope] createQueryBuilder sobre "${metadata.name}" sin contexto de empresa. ` +
        `Usa withoutTenantScope(caller, fn) si es intencional.`,
      );
    }

    return qb.where(`${alias}.empresaId = :__eid`, { __eid: eid }) as SelectQueryBuilder<T>;
  }

  // ── Escape hatch ──────────────────────────────────────────────────────────

  /**
   * Permite ejecutar queries cross-tenant intencionalmente (cron jobs, migraciones).
   * LOGEA la razón. Usar con justificación explícita.
   *
   * USO:
   *   const total = await this.tenantService.withoutTenantScope(
   *     'CronJob:renumerar-folios',
   *     () => this.repo.find(),
   *   );
   */
  async withoutTenantScope<T>(caller: string, fn: () => Promise<T>): Promise<T> {
    this.logger.warn(`[TenantScope] withoutTenantScope activado por: ${caller}`);
    this.cls.set(SKIP_TENANT_KEY,    true);
    this.cls.set(SKIP_TENANT_CALLER, caller);
    try {
      return await fn();
    } finally {
      this.cls.set(SKIP_TENANT_KEY,    false);
      this.cls.set(SKIP_TENANT_CALLER, undefined);
    }
  }

  // ── runAs: actuar como una empresa específica ─────────────────────────────

  /**
   * Ejecuta `fn` con el contexto de empresa forzado a `empresaId`.
   * Usar cuando super admin quiere ver datos de una empresa específica.
   *
   * A diferencia de withoutTenantScope, el filtro SIGUE activo — solo cambia
   * a qué empresa apunta. Esto previene leaks a otras empresas.
   *
   * USO:
   *   await this.tenantService.runAs(empresaIdCliente, () =>
   *     this.cxcService.getResumen()
   *   );
   */
  async runAs<T>(empresaId: number, fn: () => Promise<T>): Promise<T> {
    const prevEid = this.cls.get<number>(TENANT_KEY);
    this.logger.warn(`[TenantScope] runAs(${empresaId}) desde empresa ${prevEid ?? 'null'}`);
    this.cls.set(TENANT_KEY, empresaId);
    try {
      return await fn();
    } finally {
      this.cls.set(TENANT_KEY, prevEid ?? undefined);
    }
  }

  // ── TenantAwareRepository factory ─────────────────────────────────────────

  /**
   * Envuelve un Repository<T> en un TenantAwareRepository<T> que inyecta
   * automáticamente WHERE empresaId en todas las queries sobre @TenantScoped.
   *
   * USO en servicios:
   *   private tenantRepo: TenantAwareRepository<CuentaPorCobrar>;
   *
   *   constructor(@InjectRepository(CuentaPorCobrar) repo, tenant: TenantService) {
   *     this.tenantRepo = tenant.wrap(repo);
   *   }
   */
  wrap<T extends ObjectLiteral>(repo: Repository<T>): TenantAwareRepository<T> {
    return new TenantAwareRepository(repo, this.cls, this.dataSource);
  }

  /**
   * Resuelve el sucursalId final a usar al crear un documento.
   * Si dto provee uno, verifica que pertenezca a la empresa del JWT.
   * Si no es válido (e.g. cache obsoleta del form), cae al sucursalId del JWT.
   */
  async resolveSucursalId(dtoSucursalId?: number | null): Promise<number | undefined> {
    const jwtSucursalId = this.getSucursalId();
    if (!dtoSucursalId) return jwtSucursalId ?? undefined;
    const empresaId = this.getEmpresaId();
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM sucursales WHERE id = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
      [dtoSucursalId, empresaId],
    );
    if (!rows.length) {
      this.logger.warn(
        `[SucursalId] dto.sucursalId=${dtoSucursalId} no pertenece a empresa ${empresaId}; ` +
        `usando JWT sucursalId=${jwtSucursalId}`,
      );
      return jwtSucursalId ?? undefined;
    }
    return dtoSucursalId;
  }

  /** Expone ClsService para TenantAwareRepository (solo uso interno del módulo). */
  get clsService(): ClsService { return this.cls; }
}
