import {
  EventSubscriber, EntitySubscriberInterface, LoadEvent, DataSource,
} from 'typeorm';
import { isTenantScoped } from './decorators/tenant-scoped.decorator';
import { ClsService } from 'nestjs-cls';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

export const SKIP_TENANT_KEY    = '__skipTenantScope';
export const SKIP_TENANT_CALLER = '__skipTenantCaller';

/**
 * TenantSubscriber — circuit breaker de seguridad multi-tenant.
 *
 * Funciona como capa de DETECCIÓN a nivel de entidad cargada:
 * si una entidad con empresaId es materializadaencontexto de otra empresa,
 * lanza ForbiddenException inmediatamente (data leak atrapado).
 *
 * TypeORM 0.3 no expone beforeFind/beforeQuery con metadatos de entidad,
 * por lo que la PREVENCIÓN por consulta se hace via TenantService.qb().
 * Este subscriber actúa como red de seguridad para find()/findOne().
 *
 * Capas de defensa:
 *   1. TenantService.qb()   → previene leaks en createQueryBuilder
 *   2. Este subscriber       → detecta y corta leaks en find() family
 *   3. Filtros manuales      → capa adicional redundante en métodos críticos
 */
@Injectable()
@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(TenantSubscriber.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {
    this.dataSource.subscribers.push(this);
  }

  // Escucha todas las entidades
  listenTo() { return Object; }

  /**
   * Fires after cada entidad es materializada desde la BD.
   * Si la entidad tiene empresaId y NO coincide con el contexto → ForbiddenException.
   */
  afterLoad(entity: any, event?: LoadEvent<any>): void {
    if (!entity?.empresaId) {
      this.registrarPuntoCiego(event);
      return;
    }

    // Escape hatch activo → permitir y loguear
    if (this.cls.get<boolean>(SKIP_TENANT_KEY)) {
      const caller = this.cls.get<string>(SKIP_TENANT_CALLER) ?? 'unknown';
      this.logger.warn(
        `[TenantScope] afterLoad cross-tenant AUTORIZADO — ` +
        `entidad empresaId=${entity.empresaId} caller: ${caller}`,
      );
      return;
    }

    const eid = this.cls.get<number>('empresaId');
    if (!eid) return; // Sin contexto de empresa (rutas públicas, crons) → ignorar

    if (entity.empresaId !== eid) {
      // LEAK DETECTADO: se está materializando una entidad de otra empresa
      this.logger.error(
        `[TenantScope] DATA LEAK DETECTADO en ${entity.constructor?.name}: ` +
        `entidad empresaId=${entity.empresaId} cargada en contexto empresaId=${eid}`,
      );
      throw new ForbiddenException(
        `Acceso denegado: entidad de empresa ${entity.empresaId} en contexto de empresa ${eid}.`,
      );
    }
  }

  // ── Punto ciego del subscriber ─────────────────────────────────────────────
  //
  // P0 Libro Mayor (2026-09-23): un .select([...]) parcial que omite empresaId
  // hace que la entidad llegue aquí sin ese campo, y el guardia de arriba se
  // salta sin validar nada. No se puede bloquear — hay selects parciales
  // legítimos por todas partes — pero sí dejar de ser ciego: se cuenta por
  // entidad y se avisa, para que el próximo caso se vea en los logs en vez de
  // aparecer meses después en la pantalla de un cliente.

  /** Entidad @TenantScoped → veces que se cargó sin empresaId en el select. */
  private readonly puntosCiegos = new Map<string, number>();

  /** Snapshot del contador, para logs agregados o un endpoint de diagnóstico. */
  getPuntosCiegos(): Record<string, number> {
    return Object.fromEntries(this.puntosCiegos);
  }

  private registrarPuntoCiego(event?: LoadEvent<any>): void {
    const target = event?.metadata?.target;
    // Solo interesa si la entidad ESTÁ scopeada por tenant y de verdad tiene
    // la columna: un select parcial sobre algo sin empresaId no es un hueco.
    if (!isTenantScoped(target as Function)) return;
    if (!event?.metadata?.columns?.some(c => c.propertyName === 'empresaId')) return;
    if (!this.cls.get<number>('empresaId')) return; // sin contexto: nada que validar

    const nombre = event.metadata.name ?? 'desconocida';
    const veces  = (this.puntosCiegos.get(nombre) ?? 0) + 1;
    this.puntosCiegos.set(nombre, veces);

    // Ruidoso la primera vez y luego cada 100: sirve para detectarlo sin
    // inundar el log de una consulta que corre en cada request.
    if (veces === 1 || veces % 100 === 0) {
      this.logger.warn(
        `[TenantScope] PUNTO CIEGO en ${nombre}: entidad @TenantScoped cargada sin ` +
        `empresaId en el select — el guardia cross-tenant no puede validarla (${veces} veces). ` +
        `Agrega empresaId al .select() y filtra empresaId en el query.`,
      );
    }
  }
}
