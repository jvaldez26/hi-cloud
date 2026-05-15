import {
  Repository, FindManyOptions, FindOneOptions, FindOptionsWhere,
  SelectQueryBuilder, ObjectLiteral, DataSource,
} from 'typeorm';
import { Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { isTenantScoped } from './decorators/tenant-scoped.decorator';
import { TenantContextMissingException } from './exceptions/tenant-context-missing.exception';
import { SKIP_TENANT_KEY, SKIP_TENANT_CALLER } from './tenant.subscriber';

const TENANT_EID_KEY = 'empresaId';

/**
 * TenantAwareRepository<T> — wrapper sobre Repository<T> que inyecta automáticamente
 * el filtro empresaId en todas las queries sobre entidades @TenantScoped.
 *
 * Sistema OPT-OUT: filtra por defecto, solo se salta con declaración explícita.
 *
 * NUNCA retorna silenciosamente datos de otras empresas.
 * Si falta el contexto → TenantContextMissingException, no '1=1'.
 *
 * Creación: tenantService.wrap(this.repo)
 */
export class TenantAwareRepository<T extends ObjectLiteral> {
  private static readonly log = new Logger('TenantAwareRepository');

  constructor(
    readonly inner: Repository<T>,
    private readonly cls: ClsService,
    private readonly ds: DataSource,
  ) {}

  // ── Comprobación de contexto ───────────────────────────────────────────────

  private get entityName(): string {
    try { return this.ds.getMetadata(this.inner.target).name; } catch { return String(this.inner.target); }
  }

  private get isBypassed(): boolean {
    return this.cls.get<boolean>(SKIP_TENANT_KEY) === true;
  }

  /**
   * Obtiene el empresaId activo o lanza TenantContextMissingException.
   * Si el bypass está activo, devuelve undefined (sin filtro).
   */
  private getEid(): number | undefined {
    if (this.isBypassed) {
      const caller = this.cls.get<string>(SKIP_TENANT_CALLER) ?? 'unknown';
      TenantAwareRepository.log.warn(
        `[TenantScope] Bypass activo en ${this.entityName} — caller: ${caller}`,
      );
      return undefined;
    }

    if (!isTenantScoped(this.inner.target as unknown as Function)) {
      return undefined; // No es @TenantScoped — sin filtro
    }

    const eid = this.cls.get<number>(TENANT_EID_KEY);
    if (!eid) {
      throw new TenantContextMissingException(this.entityName);
    }
    return eid;
  }

  private injectWhere(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
    eid: number | undefined,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined {
    if (!eid) return where;
    const inject = { empresaId: eid } as unknown as FindOptionsWhere<T>;
    if (Array.isArray(where)) return where.map(w => ({ ...w, ...inject }));
    return { ...(where ?? {}), ...inject } as FindOptionsWhere<T>;
  }

  // ── API principal ──────────────────────────────────────────────────────────

  find(options?: FindManyOptions<T>): Promise<T[]> {
    try {
      const eid = this.getEid();
      if (!eid) return this.inner.find(options);
      return this.inner.find({ ...options, where: this.injectWhere(options?.where, eid) });
    } catch (e) { return Promise.reject(e); }
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    try {
      const eid = this.getEid();
      if (!eid) return this.inner.findOne(options);
      return this.inner.findOne({ ...options, where: this.injectWhere(options?.where, eid) });
    } catch (e) { return Promise.reject(e); }
  }

  findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]> {
    try {
      const eid = this.getEid();
      if (!eid) return this.inner.findAndCount(options);
      return this.inner.findAndCount({ ...options, where: this.injectWhere(options?.where, eid) });
    } catch (e) { return Promise.reject(e); }
  }

  findBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
    try {
      const eid = this.getEid();
      if (!eid) return this.inner.findBy(where);
      return this.inner.findBy(this.injectWhere(where, eid) as FindOptionsWhere<T>);
    } catch (e) { return Promise.reject(e); }
  }

  findOneBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null> {
    try {
      const eid = this.getEid();
      if (!eid) return this.inner.findOneBy(where);
      return this.inner.findOneBy(this.injectWhere(where, eid) as FindOptionsWhere<T>);
    } catch (e) { return Promise.reject(e); }
  }

  count(options?: FindManyOptions<T>): Promise<number> {
    try {
      const eid = this.getEid();
      if (!eid) return this.inner.count(options);
      return this.inner.count({ ...options, where: this.injectWhere(options?.where, eid) });
    } catch (e) { return Promise.reject(e); }
  }

  /**
   * Devuelve un QueryBuilder con WHERE empresaId ya inyectado.
   * Usa este método en lugar de inner.createQueryBuilder() directo.
   */
  createQueryBuilder(alias?: string): SelectQueryBuilder<T> {
    const qb = this.inner.createQueryBuilder(alias);
    try {
      const eid = this.getEid();
      if (!eid) return qb;
      return qb.where(`${alias ?? this.inner.metadata.tableName}.empresaId = :__eid`, { __eid: eid }) as SelectQueryBuilder<T>;
    } catch (e) { throw e; } // QB sí lanza — no es async
  }

  /** Delega métodos de escritura directamente al inner (INSERT/UPDATE/DELETE no filtran por tenant) */
  save(entity: T, options?: any): Promise<T>;
  save(entity: T[], options?: any): Promise<T[]>;
  save(entity: T | T[], options?: any): Promise<T | T[]> { return this.inner.save(entity as any, options); }
  update(criteria: any, update: any): Promise<any>        { return this.inner.update(criteria, update); }
  delete(criteria: any): Promise<any>                     { return this.inner.delete(criteria); }
  create(dto?: any): T                                    { return this.inner.create(dto as any) as unknown as T; }

  // ── Escape hatch puntual ───────────────────────────────────────────────────

  /**
   * Retorna el inner Repository sin filtro tenant. Loguea para auditoría.
   *
   * USAR SOLO cuando sea realmente necesario. Prefiere runWithoutScope() en
   * TenantService para contextos completos.
   */
  withoutTenantScope(): Repository<T> {
    TenantAwareRepository.log.warn(
      `[TenantScope] withoutTenantScope() llamado en ${this.entityName}`,
    );
    return this.inner;
  }

  // Acceso al repositorio subyacente y metadata
  get metadata()  { return this.inner.metadata; }
  get target()    { return this.inner.target; }
  get manager()   { return this.inner.manager; }
}
