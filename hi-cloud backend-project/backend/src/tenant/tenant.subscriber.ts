import {
  EventSubscriber, EntitySubscriberInterface, LoadEvent, DataSource,
} from 'typeorm';
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
  afterLoad(entity: any): void {
    if (!entity?.empresaId) return;

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
}
