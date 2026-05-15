import 'reflect-metadata';

const TENANT_SCOPED_KEY = Symbol('TenantScoped');

/**
 * Marca una entidad como "tenant-scoped".
 * Cualquier query a través de TenantAwareRepository<T> inyectará automáticamente
 * WHERE empresaId = :ctx_empresa_id.
 *
 * Si no hay empresaId en el CLS context → TenantContextMissingException (jamás '1=1').
 *
 * @example
 * @TenantScoped()
 * @Entity('cuentas_por_cobrar')
 * export class CuentaPorCobrar extends TenantBaseEntity { ... }
 */
export function TenantScoped(): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata(TENANT_SCOPED_KEY, true, target);
  };
}

/** Comprueba si una clase de entidad tiene el decorador @TenantScoped(). */
export function isTenantScoped(entityClass: Function | string | undefined): boolean {
  if (!entityClass || typeof entityClass !== 'function') return false;
  return Reflect.getMetadata(TENANT_SCOPED_KEY, entityClass) === true;
}
