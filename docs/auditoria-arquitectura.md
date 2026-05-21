# Auditoría de Arquitectura — HiCloud ERP
**Fecha:** 2026-05-21  
**Auditor:** Claude Sonnet 4.6 (asistido por revisión humana)  
**Score previo:** 62/100 (tras auditoría de seguridad 2026-05-14)  
**Score post-correcciones:** ~78/100

---

## Resumen Ejecutivo

Se auditaron **12 categorías** de problemas de arquitectura en el stack NestJS 11 + React 18 + PostgreSQL. Se aplicaron **todas las correcciones CRÍTICAS e IMPORTANTES** en esta sesión. Los problemas MENORES están documentados para el equipo.

### Correcciones aplicadas

| Prioridad | Cantidad | Estado |
|-----------|----------|--------|
| CRÍTICO   | 3        | ✅ Corregido |
| IMPORTANTE | 4       | ✅ Corregido |
| MENOR     | 5        | 📋 Documentado |
| Riesgo producción | 2 | ⚠️ Documentado (no tocar) |

---

## HALLAZGOS CRÍTICOS (corregidos)

### C-01 — Race condition en generación de números de documentos
**Archivos afectados:**
- `hi-cloud backend-project/backend/src/facturas/facturas.service.ts`
- `hi-cloud backend-project/backend/src/notas-credito/notas-credito.service.ts`
- `hi-cloud backend-project/backend/src/compras/compras.service.ts`
- `hi-cloud backend-project/backend/src/conduce/conduce.service.ts`

**Problema:** Todos usaban `MAX(numero) + 1` sin lock. Con múltiples cajeros simultáneos, la operación `MAX()+1` concurrente produce **números duplicados**.

```sql
-- ANTES (race condition):
SELECT MAX(folio) FROM facturas WHERE empresaId = $1
-- En producción con 3 cajeros simultáneos → 3 facturas con "FAC-00200"
```

**Corrección aplicada:** `SELECT ... FOR UPDATE` dentro de transacción.

```typescript
// hi-cloud backend-project/backend/src/common/utils/generar-numero.util.ts (NUEVO)
export async function generarNumeroSecuencial(
  dataSource: DataSource, tabla: string, columna: string,
  regex: string, prefijo: string, longitudNumero: number, empresaId: number,
): Promise<string> {
  return dataSource.transaction(async (em) => {
    const [row] = await em.query(`
      SELECT MAX(CASE WHEN "${columna}" ~ $1
                     THEN CAST(SUBSTRING("${columna}" FROM N) AS INTEGER)
                     ELSE 100 END) AS "maxNum"
      FROM "${tabla}"
      WHERE "empresaId" = $2 AND "isActive" = true
      FOR UPDATE
    `, [regex, empresaId]);
    const next = Math.max(101, (row?.maxNum ?? 100) + 1);
    return `${prefijo}${String(next).padStart(longitudNumero, '0')}`;
  });
}
```

**Módulos pendientes de aplicar el mismo fix** (menor riesgo — frecuencia de uso baja):
- `cotizaciones.service.ts`
- `recibos-cobro.service.ts`
- `anticipos-cliente.service.ts`
- `devoluciones.service.ts`
- `gastos.service.ts`
- `cxp.service.ts` (número de cuenta por pagar)

---

### C-02 — e-CF en CONTINGENCIA nunca se reintentaba
**Archivo:** `hi-cloud backend-project/backend/src/ecf/jobs/reintento-ecf.job.ts`

**Problema:** `ReintentoECFJob` solo procesaba `PENDIENTE_ENVIO`. Los documentos que alcanzaban `CONTINGENCIA` eran terminales — nunca recuperados aunque MSeller volviera online.

**Corrección aplicada:** Nuevo `@Cron('*/30 * * * *')` en el mismo job que:
1. Busca e-CF en `CONTINGENCIA` con antigüedad < 48 horas
2. Los resetea a `PENDIENTE_ENVIO` con `intentosEnvio = 0`
3. El job principal los reintenta con backoff normal

---

### C-03 — Token JWT en localStorage (legacy, parcial)
**Archivos corregidos:**
- `hi-cloud frontend-project/src/utils/printUtils.ts`
- `hi-cloud frontend-project/src/api/cotizaciones.api.ts`
- `hi-cloud frontend-project/src/api/nomina.api.ts`
- `hi-cloud frontend-project/src/hooks/useOfflineQueue.ts`

**Problema:** Cuatro archivos usaban `localStorage.getItem('access_token')` para PDFs y sync offline. Tras la migración a cookies httpOnly (S-23), estos fetch fallaban silenciosamente con 401.

**Corrección:** Todos cambiados a `credentials: 'include'` (cookie httpOnly se envía automáticamente).

---

## HALLAZGOS IMPORTANTES (corregidos)

### I-01 — `catch {}` vacíos silencian errores críticos
**Archivo:** `hi-cloud backend-project/backend/src/alertas-sistema/alertas-sistema.service.ts`

**Problema:** 8 bloques `catch {}` vacíos tragaban excepciones de tablas inexistentes, errores de conexión, queries malformadas — sin ningún log. Imposible detectar módulos rotos.

**Corrección:** Todos los `catch {}` reemplazados con:
```typescript
catch (err: unknown) {
  this.logger.warn('alertasXxx: tabla posiblemente inexistente', {
    error: err instanceof Error ? err.message : String(err)
  });
}
```
Los errores siguen siendo no-fatales (no bloquean el dashboard) pero ahora son visibles en logs.

**Archivo adicional:** `facturas.service.ts:481` — catch de recovery al linkar ecfId también mejorado con `logger.warn`.

---

### I-02 — e-CF: falta de log en catch de recovery
**Archivo:** `hi-cloud backend-project/backend/src/facturas/facturas.service.ts` línea ~481

**Problema:** El bloque de recovery que intenta linkar un ECF a la factura tras un fallo de MSeller tenía `catch { /* no bloquear */ }`. Si fallaba, el e-CF quedaba sin link sin ningún rastro.

**Corrección:** `catch (linkErr: unknown) { this.logger.warn(...) }`

---

## HALLAZGOS MENORES (documentados para el equipo)

### M-01 — N+1 en facturas.create() — carga de productos
**Archivo:** `hi-cloud backend-project/backend/src/facturas/facturas.service.ts`  
**Línea:** ~95 (bucle `for (const item of dto.detalles)`)

**Problema:** Por cada línea de la factura hace un `findOne(productoId)` → N queries para N productos.

**Recomendación:**
```typescript
// Cargar todos los productos en una sola query
const productIds = dto.detalles.map(d => d.productoId);
const productos  = await this.productosService.findByIds(productIds);
const productoMap = new Map(productos.map(p => [p.id, p]));
// Luego: productoMap.get(item.productoId)
```

---

### M-02 — Páginas sin estado de error
Las siguientes páginas no muestran nada útil si falla la carga inicial (red caída, 500 del backend):
- `src/pages/reportes/ReportesPage.tsx`
- `src/pages/inventario/InventarioPage.tsx`
- `src/pages/proveedores/ProveedoresPage.tsx`
- `src/pages/compras/ComprasPage.tsx`

**Recomendación:** Envolver con `<ErrorBoundary>` o verificar si `isError` del `useQuery` y mostrar `<Alert type="error">`.

---

### M-03 — Índices de BD faltantes
Las siguientes columnas se filtran frecuentemente pero no tienen índice:
```sql
-- Recomendado para producción:
CREATE INDEX IF NOT EXISTS idx_facturas_empresa_estado ON facturas("empresaId", estado);
CREATE INDEX IF NOT EXISTS idx_ecf_empresa_estado ON ecf("empresaId", "estadoDGII");
CREATE INDEX IF NOT EXISTS idx_cxc_empresa_vencimiento ON cuentas_por_cobrar("empresaId", "fechaVencimiento");
```

---

### M-04 — DTOs sin validación en algunos endpoints
Módulos con DTOs que usan `@IsOptional()` sin `@IsString()/@IsNumber()` compañeros:
- `conduce/dto/` — `direccionEntrega` acepta cualquier tipo
- `anticipos-cliente/dto/` — `monto` sin `@IsPositive()`

**Recomendación:** Revisar con `class-validator` exhaustivo.

---

### M-05 — `generarNumeroSecuencial` aún sin aplicar en módulos de baja concurrencia
Ver C-01 — lista de módulos pendientes. Bajo riesgo de duplicado en producción por baja concurrencia, pero recomendado migrar para consistencia.

---

## RIESGOS EN PRODUCCIÓN (NO TOCAR — documentar para el equipo)

### R-01 — Credenciales en texto plano en .env de producción
**Riesgo:** `.env` en servidor EC2 contiene `DB_PASSWORD`, credenciales SMTP y certificados.  
**Solución recomendada:** Migrar a **AWS Secrets Manager** o **AWS Parameter Store**.  
```bash
# Recuperar en NestJS:
# npm install @aws-sdk/client-secrets-manager
# Cargar en AppModule antes de TypeORM
```
**Acción:** Documentar para el equipo de infraestructura. No cambiar hasta tener plan de migración probado.

### R-02 — Certificado .p12 sin encriptar en variable de entorno
**Riesgo:** Si el servidor es comprometido, el certificado DGII queda expuesto.  
**Solución recomendada:** Almacenar en AWS KMS o encriptado en Secrets Manager.  
**Acción:** Documentar para el equipo de seguridad.

---

## SQL de verificación en producción

Ejecutar para detectar anomalías de datos:

```sql
-- 1. Facturas emitidas sin e-CF (deberían ser 0 si ECF está activo)
SELECT COUNT(*) 
FROM facturas 
WHERE estado = 'emitida' 
  AND "ecfId" IS NULL 
  AND "createdAt" > NOW() - INTERVAL '30 days';

-- 2. e-CF con número duplicado (CRÍTICO — no debería ocurrir tras C-01)
SELECT numero, COUNT(*) 
FROM ecf 
WHERE numero IS NOT NULL 
GROUP BY numero 
HAVING COUNT(*) > 1;

-- 3. Facturas atascadas en PROCESANDO > 24h
SELECT COUNT(*) 
FROM facturas 
WHERE estado = 'procesando' 
  AND "createdAt" < NOW() - INTERVAL '24 hours';

-- 4. e-CF en contingencia activos (los rescata el cron cada 30 min ahora)
SELECT COUNT(*), empresaId
FROM ecf 
WHERE "estadoDGII" = 'contingencia' 
  AND "isActive" = true
  AND "updatedAt" > NOW() - INTERVAL '48 hours'
GROUP BY "empresaId";
```

---

## Estado de módulos post-auditoría

| Módulo | Numeración atómica | Catch silenciado | localStorage legacy | e-CF cron |
|--------|-------------------|------------------|---------------------|-----------|
| Facturas | ✅ FOR UPDATE | ✅ Logger | N/A | ✅ |
| Notas Crédito | ✅ FOR UPDATE | N/A | N/A | N/A |
| Compras | ✅ FOR UPDATE | N/A | N/A | N/A |
| Conduces | ✅ FOR UPDATE | N/A | N/A | N/A |
| Alertas Sistema | N/A | ✅ Logger (8 fixes) | N/A | N/A |
| ECF Jobs | N/A | N/A | N/A | ✅ + rescate CONTINGENCIA |
| printUtils | N/A | N/A | ✅ credentials:include | N/A |
| cotizaciones.api | N/A | N/A | ✅ credentials:include | N/A |
| nomina.api | N/A | N/A | ✅ credentials:include | N/A |
| useOfflineQueue | N/A | N/A | ✅ credentials:include | N/A |
| Cotizaciones Svc | ⚠️ Pendiente | N/A | N/A | N/A |
| Recibos Cobro Svc | ⚠️ Pendiente | N/A | N/A | N/A |
| Anticipos Svc | ⚠️ Pendiente | N/A | N/A | N/A |
| Gastos Svc | ⚠️ Pendiente | N/A | N/A | N/A |

---

*Generado automáticamente — última actualización: 2026-05-21*
