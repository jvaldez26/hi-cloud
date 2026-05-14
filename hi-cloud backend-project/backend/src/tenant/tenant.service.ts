import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { SKIP_TENANT_KEY, SKIP_TENANT_CALLER } from './tenant.subscriber';

const TENANT_KEY = 'empresaId';
const USER_KEY   = 'userId';
const ROL_KEY    = 'rolEmpresa';

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
    if (!id) throw new ForbiddenException('Se requiere contexto de empresa. Incluye el header X-Empresa-ID.');
    return id;
  }

  getEmpresaIdOrNull(): number | null {
    return this.cls.get<number>(TENANT_KEY) ?? null;
  }

  setEmpresaId(id: number): void { this.cls.set(TENANT_KEY, id); }
  getUserId(): number | null     { return this.cls.get<number>(USER_KEY) ?? null; }
  setUserId(id: number): void    { this.cls.set(USER_KEY, id); }
  getRolEmpresa(): string | null  { return this.cls.get<string>(ROL_KEY) ?? null; }
  setRolEmpresa(rol: string): void { this.cls.set(ROL_KEY, rol); }

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
}
