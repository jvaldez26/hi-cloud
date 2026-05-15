# Migraciones de BD — HiCloud ERP

## TL;DR

Cuando cambias una entidad TypeORM, ejecuta:

```bash
npm run migration:generate -- src/migrations/NombreDescriptivo
git add src/migrations/
git commit -m "feat: agregar columna X a entidad Y"
git push
```

El deploy aplica la migración automáticamente antes de reiniciar el backend.

---

## Regla de oro: NUNCA crear tablas con SQL manual

Los deploys anteriores fallaron porque tablas como `refresh_tokens` fueron
creadas con SQL usando `snake_case` (`user_id`) cuando TypeORM espera
`camelCase` (`userId`). El sistema de migraciones previene este error
generando el SQL correcto automáticamente.

---

## Comandos disponibles

```bash
# Generar migración desde diferencias entre entidades y BD
npm run migration:generate -- src/migrations/NombreDescriptivo

# Aplicar migraciones pendientes
npm run migration:run

# Revertir la última migración aplicada
npm run migration:revert

# Ver estado de migraciones (cuáles están aplicadas)
npm run migration:show

# Crear migración vacía para SQL manual
npm run migration:create -- src/migrations/NombreDescriptivo
```

---

## Flujo de trabajo para añadir una columna nueva

1. Modifica la entidad TypeORM:
   ```typescript
   @Column({ nullable: true })
   nuevoCampo?: string;
   ```

2. Genera la migración:
   ```bash
   npm run migration:generate -- src/migrations/AddNuevoCampoToEntidad
   ```
   TypeORM inspecciona las entidades y la BD, genera el SQL de diferencia.

3. Revisa el archivo generado en `src/migrations/`:
   - Debe tener `ALTER TABLE "tabla" ADD COLUMN "nombreColumna" tipo`
   - Verifica que los nombres usan **camelCase** (ej: `"nuevoCampo"`, no `nuevo_campo`)

4. Commitea junto con el cambio de entidad:
   ```bash
   git add src/ 
   git commit -m "feat: añadir nuevoCampo a Entidad"
   git push
   ```

5. El deploy aplica la migración automáticamente. No se necesita acción manual.

---

## Flujo para eliminar una columna

⚠️ **CUIDADO**: Eliminar columnas puede causar pérdida de datos.

1. Marca la columna como deprecada primero (un deploy):
   ```typescript
   @Column({ nullable: true, comment: 'DEPRECATED: eliminar en v2.5' })
   campoViejo?: string;
   ```

2. En el siguiente release, elimínala del entity y genera migración.

---

## Cuando una migración falla en producción

```bash
# 1. Ver qué migración falló
npm run migration:show

# 2. Revertir si ya se aplicó parcialmente
npm run migration:revert

# 3. Corregir el SQL de la migración
# 4. Volver a aplicar
npm run migration:run
```

---

## Naming convention (CRÍTICO)

TypeORM **sin** NamingStrategy usa el nombre exacto de la propiedad TypeScript
como nombre de columna. Esto significa:

| Propiedad TypeScript | Columna en BD |
|---|---|
| `empresaId` | `"empresaId"` |
| `tokenHash` | `"tokenHash"` |
| `createdAt` | `"createdAt"` |

**NUNCA** escribir SQL manual con `snake_case` (`empresa_id`, `token_hash`)
porque TypeORM no los encontrará.

---

## Cómo aplicar en EC2 manualmente (emergencia)

```bash
ssh ubuntu@3.137.152.75
cd "/home/ubuntu/hicloud/hi-cloud backend-project/backend"
node -e "
  const { AppDataSource } = require('./dist/data-source');
  AppDataSource.initialize()
    .then(ds => ds.runMigrations())
    .then(m => { console.log('OK:', m.map(x=>x.name)); process.exit(0); })
    .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
"
```

---

## Historial de migraciones

| Timestamp | Nombre | Descripción |
|---|---|---|
| 1747360000000 | Baseline1747360000000 | Estado inicial de producción (no ejecuta SQL) |

*Actualizar esta tabla al añadir cada migración.*
