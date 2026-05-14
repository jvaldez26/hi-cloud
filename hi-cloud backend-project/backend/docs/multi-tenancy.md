# Multi-Tenancy en HiCloud ERP

## TL;DR (5 minutos)

HiCloud es multi-tenant: cada empresa tiene sus propios datos y **NUNCA** debe ver datos de otra empresa.

Todo el código que lee datos de tablas con `empresaId` debe respetar este aislamiento.
Hay tres capas de defensa para garantizarlo:

---

## Capa 1 — `TenantService.qb()` (para createQueryBuilder)

Cuando usas `createQueryBuilder`, usa **siempre** el helper:

```typescript
// ❌ MAL — lee datos de TODAS las empresas
this.cxcRepository.createQueryBuilder('c')
  .where('c.estado = :e', { e: 'pendiente' })
  .getMany();

// ✅ BIEN — automáticamente añade WHERE empresaId = <eid_del_request>
this.tenantService.qb(this.cxcRepository, 'c')
  .andWhere('c.estado = :e', { e: 'pendiente' })
  .getMany();
```

`tenantService.qb()` hace dos cosas:
1. Inyecta automáticamente `WHERE c.empresaId = :eid`
2. **Lanza `ForbiddenException`** si no hay contexto de empresa (bug detectado)

---

## Capa 2 — `TenantSubscriber` (circuit breaker en afterLoad)

Un TypeORM EventSubscriber escucha cada entidad cargada desde la BD.
Si una entidad tiene `empresaId` diferente al contexto del request, **lanza excepción**.

Esto actúa como red de seguridad para queries `find()` / `findOne()` que olvidaron el filtro.

---

## Capa 3 — Filtro manual en find()

Para `find()` / `findOne()` / `count()`, TypeORM 0.3 no tiene un hook automático de filtrado.
Debes incluir el filtro manualmente:

```typescript
// ✅ BIEN
this.cxcRepository.find({
  where: {
    isActive: true,
    empresaId: this.tenantService.getEmpresaId(),
  },
});
```

---

## Escape hatch — `withoutTenantScope()`

Para cron jobs, migraciones, o queries cross-tenant **intencionales**:

```typescript
// Justifica SIEMPRE la razón
const todosLosRegistros = await this.tenantService.withoutTenantScope(
  'CronJob:renumerar-folios',
  () => this.repo.find({ where: { isActive: true } }),
);
```

Esto:
- Permite el query sin restricción de empresa
- **Logea la razón** con nivel WARN para auditoría
- Lanza después de la operación (no persiste el bypass)

---

## Añadir una nueva entidad tenant-scoped

1. Extiende `TenantBaseEntity` (ya incluye `empresaId`):

```typescript
@Entity('mi_tabla')
export class MiEntidad extends TenantBaseEntity {
  // ...
}
```

2. En el servicio, usa `tenantService.qb()` para createQueryBuilder y añade
   `empresaId: this.tenantService.getEmpresaId()` al where de find():

```typescript
// createQueryBuilder
this.tenantService.qb(this.repo, 'm').andWhere(...).getMany();

// find/findOne
this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
```

---

## Qué pasa si olvidas el filtro

1. `TenantService.qb()` → lanza `ForbiddenException` en development y production
2. `TenantSubscriber.afterLoad()` → lanza `ForbiddenException` si se materializa una entidad de otra empresa
3. Tests de regresión → fallan con datos cruzados

---

## Entidades tenant-scoped (129)

Todas las entidades que extienden `TenantBaseEntity` son tenant-scoped.
El campo `empresaId` está en `TenantBaseEntity` y es indexado.

Entidades NO tenant-scoped (globales, 27):
- `User`, `Empresa`, `DemoRequest`, `PlanConfiguracion`, `Suscripcion` (cross-tenant by design)
- Entities de detalle sin `empresaId` (`FacturaDetalle`, `CompraDetalle`, etc.) — están scoped via su padre

---

## Casos legítimos de cross-tenant

| Caso | Cómo manejarlo |
|---|---|
| Cron jobs que leen todas las empresas | `withoutTenantScope('CronJob:nombre', fn)` |
| Scripts de migración | `withoutTenantScope('Migration:nombre', fn)` |
| Super Admin dashboard | `withoutTenantScope('SuperAdmin:stats', fn)` |
| `auth.service.ts` al crear empresa | Ya tiene `empresaRepository` directo (no tenant-scoped) |

---

## Tests de regresión

Ver `src/tenant/tenant.spec.ts` — incluye test del bug original:
- Empresa B recién creada no debe ver datos de Empresa A en ningún endpoint
