# HiCloud ERP — Checklist de Seguridad para Módulos Nuevos

Antes de hacer merge de cualquier módulo nuevo o endpoint significativo,
verificar cada ítem de esta lista.

---

## 1. Multi-tenant (CRÍTICO — falla silenciosa)

- [ ] Todos los `find`, `findOne`, `createQueryBuilder` filtran por `empresaId`
- [ ] `empresaId` proviene de `tenantService.getEmpresaId()` — NUNCA del DTO, params, ni `req.body`
- [ ] Los endpoints `POST` usan `tenantService.getEmpresaId()` para asignar el `empresaId` de la entidad nueva
- [ ] Los endpoints `GET /id` verifican que el registro pertenezca a la empresa del usuario (no solo que exista)
- [ ] No hay ningún loop o batch que procese registros de múltiples empresas sin separación explícita

**Patrón correcto:**
```typescript
const empresaId = await this.tenantService.getEmpresaId();
return this.repo.find({ where: { empresaId } });
```

---

## 2. SQL / QueryBuilder (CRÍTICO — SQLi)

- [ ] Cero interpolaciones `${variable}` dentro de `.query(` o `.createQueryBuilder`
- [ ] Parámetros dinámicos usan `$1, $2, ...` en raw SQL o `.setParameter()` en QB
- [ ] Si hay un `ORDER BY` o `GROUP BY` dinámico: usar allowlist explícito (nunca pasar el valor del usuario directo)
- [ ] Si hay `INTERVAL` dinámico: parametrizar el número, no la cadena completa

**Patrón correcto:**
```typescript
// Bien:
await ds.query(`SELECT * FROM tabla WHERE "empresaId" = $1`, [empresaId]);

// MAL — SQLi:
await ds.query(`SELECT * FROM tabla WHERE "empresaId" = ${empresaId}`);
```

---

## 3. Autenticación y JWT

- [ ] Todos los endpoints usan `@UseGuards(JwtAuthGuard, RolesGuard)` o están justificados como públicos (`@Public()`)
- [ ] Los endpoints públicos tienen `@Throttle()` explícito para evitar abuso
- [ ] No hay fallback de `JWT_SECRET` (`?? 'algo'` o `|| 'algo'`) — usar throw si undefined
- [ ] Los tokens sensibles (verificación email, reset password) se almacenan como hash SHA-256, no en plaintext

---

## 4. Autorización / Roles

- [ ] Endpoints de escritura (POST/PATCH/DELETE) tienen `@Roles(...)` apropiado
- [ ] Documentos fiscales (E31-E47, facturas, notas de crédito): requieren `ADMIN` o `CONTADOR`
- [ ] Operaciones destructivas (DELETE, anulación, void): requieren `ADMIN` o `supervisor`
- [ ] Super-admin endpoints: decorados con `@SuperAdmin()` y verifican JTI en blacklist
- [ ] No hay escalado de privilegios: un `VENDEDOR` no puede ejecutar lógica de `ADMIN`

---

## 5. Exposición de datos

- [ ] Errores de base de datos (`pgErr.detail`, stack traces) NO se exponen en respuestas HTTP en producción
- [ ] Passwords, tokens y secrets nunca aparecen en logs ni en respuestas API
- [ ] `logger.error()` incluye contexto útil pero no datos de usuario sensibles (contraseñas, PII innecesaria)
- [ ] Listas paginadas no devuelven todos los registros sin límite (`take`/`limit` siempre presente)

---

## 6. Validación de entrada

- [ ] DTOs usan `class-validator` con restricciones apropiadas (`@IsString()`, `@IsInt()`, `@Max()`, etc.)
- [ ] Parámetros de path/query que llegan como string y se usan como número: convertir y validar antes de usar
- [ ] Campos opcionales vs requeridos definidos correctamente — no confiar en que TypeScript "ya los valida"
- [ ] `ValidationPipe` habilitado globalmente (ya está en `main.ts`) — no necesita configuración extra por módulo

---

## 7. Uploads de archivos

- [ ] Todo `FileInterceptor` tiene `fileFilter` que valida MIME type
- [ ] Todo `FileInterceptor` tiene `limits: { fileSize: ... }` explícito
- [ ] CSV: validar `text/csv` o `application/vnd.ms-excel` + extensión `.csv`
- [ ] PDF: validar `application/pdf` + extensión `.pdf`
- [ ] Imágenes: validar MIME de imagen — no ejecutables disfrazados de PNG

**Patrón:**
```typescript
private static readonly FILE_FILTER = (req, file, cb) => {
  if (file.mimetype !== 'text/csv') {
    return cb(new BadRequestException('Solo archivos CSV'), false);
  }
  cb(null, true);
};
```

---

## 8. Audit trail

- [ ] Operaciones destructivas (DELETE, anulación) quedan registradas por `AuditInterceptor` (global — automático)
- [ ] Si el endpoint usa un flujo que omite el interceptor (jobs, crons, scripts seed): llamar `auditLogService.log()` manualmente
- [ ] Incluir `entidadId`, `modulo`, `accion`, `valorAnterior` cuando aplique

---

## 9. Variables de entorno y configuración

- [ ] Toda configuración sensible proviene de `ConfigService` / `process.env` — nunca hardcodeada
- [ ] Si se agrega una nueva variable requerida: incluirla en el `Joi.object({...})` de `app.module.ts`
- [ ] Variables opcionales: marcarlas con `.optional()` en el schema Joi
- [ ] No exponer valores de env en logs de arranque

---

## 10. Rate limiting

- [ ] Endpoints de autenticación (`/login`, `/refresh`, `/register`): tienen throttle estricto
- [ ] Endpoints costosos (generación de reportes, PDF, exportación): `@Throttle({ default: { limit: 30, ttl: 60000 } })`
- [ ] Endpoints públicos (webhooks, callbacks externos): protegidos contra flood

---

## Comandos de verificación rápida

```bash
# Correr todos los checks automáticos
bash scripts/security-check.sh

# Verificar que npm audit no tenga high/critical
npm audit --audit-level=high --omit=dev

# Verificar TypeScript sin errores
npx tsc --noEmit
```

---

## Referencia rápida — patrones prohibidos

| Patrón | Por qué | Alternativa |
|--------|---------|-------------|
| `` .query(`...${var}...`) `` | SQL injection | `.query('...WHERE x = $1', [var])` |
| `empresaId: dto.empresaId` | Cross-tenant | `empresaId: await tenantService.getEmpresaId()` |
| `secret: 'hardcoded'` | Leaked secret | `cfg.get<string>('MY_SECRET')` + Joi |
| `JWT_SECRET ?? 'fallback'` | Weak auth si falta | `if (!secret) throw new Error(...)` |
| `catch(e) {}` | Oculta errores | `catch(e) { logger.error(..., e) }` |
| `FileInterceptor()` sin filter | Upload arbitrario | Siempre con `fileFilter` + `limits` |
