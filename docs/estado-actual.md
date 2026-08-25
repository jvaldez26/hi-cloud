# Estado actual

> Lo que necesita saber quien retoma esto mañana. No es un changelog — el `git log` ya cuenta
> qué cambió. Esto cuenta **qué está a medias, qué no es obvio desde el código y qué no hay
> que volver a decidir.**
>
> **Última actualización: 2026-08-25** · HEAD `f7dc2763`
> Al cerrar o abrir un trabajo, actualizá la sección y la fecha de arriba.

---

## 1. Bug del `vendedorId` — 🟡 a medias

**Qué pasó.** El cierre de caja reúne las ventas por `vendedorId + fecha`. Cuando el POS perdía
el `localStorage`, la factura se grababa con `vendedorId` NULL y **desaparecía de todos los
cuadres sin avisar**. Nadie lo vio durante un mes porque la validación de caja estaba envuelta
en un `if (factura.vendedorId)`: justo la factura rota era la única que nadie miraba.

- **Causa:** commit `2fa2586d` (17 de agosto).
- **Alcance:** 163 facturas en agosto, RD$395,718.09.
- **Caso urgente:** caja #446 de FERRETERÍA PAVEL — 5 de 16 facturas, RD$16,574.99 fuera del
  arqueo. Ya resuelto con un backfill acotado a esas 5.

### Las tres fases

| Fase | Qué es | Estado |
|---|---|---|
| **1 — Backend** | `resolverVendedor()`: el vendedor se deriva del usuario autenticado, no se acepta del navegador | ✅ **Desplegada** (`f7dc2763`) |
| **2 — POS** | Fix del frontend para que no dependa del `localStorage` | ❌ **Sin pushear** — solo existe en la otra máquina |
| **3 — Backfill** | Script para recuperar las facturas huérfanas | ❌ **Sin pushear** — solo existe en la otra máquina |

> ⚠️ **Fases 2 y 3 no están en ningún remoto.** Se verificó: no están en `origin/main` ni en
> `origin/worktree-agent-abf8e6ad46f3b89c8` (esa rama está *detrás* de main, ya fusionada).
> **No las reescribas** — hay que traerlas de la otra máquina.

### Las huérfanas que quedan — ⚠️ conteo SIN CONFIRMAR

Las facturas con `vendedorId` NULL **no se pueden recuperar** con el backfill tal como está. El
script deriva el vendedor desde `vendedores."usuarioId"`, y esa columna **solo está poblada en
la empresa 61**. Para las demás no hay desde dónde derivar.

**Bloqueante:** poblar `vendedores."usuarioId"` en las empresas **42, 64, 57 y 44**. Hasta
entonces el backfill no tiene nada que hacer con esas facturas.

> **El número exacto está sin verificar contra producción.** Las cifras que circulan
> (163 detectadas, 5 recuperadas en la caja #446, ~157 restantes) vienen de la sesión en que se
> cazó el bug, no de una consulta reciente. Además no cuadran solas: 163 − 5 = **158**, no 157.
> No uses ninguna de esas cifras en un reporte sin correr esto primero:

```sql
-- Facturas huérfanas por empresa. Read-only.
SELECT "empresaId",
       COUNT(*)                    AS facturas,
       ROUND(SUM(total)::numeric, 2) AS monto,
       MIN("createdAt")::date      AS desde,
       MAX("createdAt")::date      AS hasta
  FROM facturas
 WHERE "vendedorId" IS NULL
   AND estado <> 'anulada'
 GROUP BY "empresaId"
 ORDER BY facturas DESC;
```

Cuando lo corras, **pegá el resultado acá y borrá este aviso.**

<sub>Por qué no está corrido ya: la máquina donde se escribió este doc es un clon limpio sin
credenciales — no hay `.env`, ni `~/.ssh`, ni `psql`/`aws`/`gh`. El host y la clave de la BD
viven en los secrets de GitHub y en la EC2. Desde un checkout nuevo no se llega.</sub>

---

## 2. Decisiones que no se deducen del código

Tres cosas que parecen bugs y no lo son. Antes de "arreglarlas", leer esto.

### Los retiros `pendiente` y `rechazado` **sí** restan del esperado
`efectivo-esperado.util.ts` cuenta todos los retiros con estado `!= 'anulado'`.

**Por qué:** el efectivo **ya salió del cajón**. El estado documenta si el supervisor lo avala,
no si el dinero volvió. Solo `anulado` revierte el monto. Un `rechazado` que no restara haría
cuadrar una caja a la que le falta dinero de verdad.

### `formulaVersion` tiene tres valores, y el `0` importa
| Valor | Significado |
|---|---|
| `0` | **Sin calcular** — nadie cuadró la caja. Hoy solo el cierre por sistema al desactivar el control de caja. |
| `1` | Fórmula original: sumaba *todos* los cobros y no contaba los anticipos. |
| `2` | Solo efectivo físicamente en el cajón — la actual. Tarjeta y transferencia nunca entran. |

**Por qué existe el `0`:** deja separar los cierres *afectados* por la fórmula vieja (v1) de los
que simplemente nunca se cuadraron. Contarlos juntos infla el problema. Dejarlos en `1` (el
default) diría "la fórmula vieja dio estos números", que es falso.

Subí la versión solo si cambia **qué** se suma. No por un refactor que no altere el resultado.

### Vender **sin** vendedor no se bloquea — a propósito
Es tentador exigir vendedor al facturar. No lo hagas todavía:

1. **No arreglaría nada.** Validar contra "cualquier caja abierta de la empresa" no restituye
   control: la factura sin vendedor no se imputa a esa caja igual, porque `recalcularDesdeBD`
   reúne por `vendedorId + fecha`.
2. **Rompería la operación.** En las 5 empresas con control de caja hay usuarios que facturan
   **~5.800 veces al mes** sin vendedor asociado. Bloquearlos los deja sin vender.

**Cuándo se puede endurecer:** cuando `vendedores."usuarioId"` esté poblado en las empresas que
faltan (las mismas 42, 64, 57, 44). Ahí `resolverVendedor()` siempre resuelve, esa rama deja de
alcanzarse sola, y recién entonces tiene sentido. Mientras tanto lo que se necesita es
visibilidad, y la da la alerta agrupada por empresa y día de `acumularFacturaSinVendedor()`
— agrupada, porque siete avisos diarios se vuelven ruido que nadie mira en una semana.

---

## 3. Trabajos abiertos

### Ventana del deploy — decidido, sin implementar
`.github/workflows/deploy.yml` sube el frontend **por SCP directo al document root en vivo**
(`/var/www/hicloudrd.com/html/`). Durante la subida el sitio sirve una mezcla de archivos
viejos y nuevos.

**Decisión tomada: opción B, con `rsync`** — subir a un directorio aparte y hacer el swap
atómico. Falta implementarlo.

### Móvil del Super Admin — revertido, hay que rehacerlo
`9b8d4e40` (menú a cajón lateral en móvil) se revirtió en `6b223a81`. El problema original
sigue ahí; hace falta otro enfoque.

### Centro de monitoreo — pendiente
Sin empezar.

### ~~PATCH de mensajes~~ — ✅ cerrado (2026-08-25)
`544b5c82` agregó `tipo` al `UpdateMensajeDto` y el PATCH dejó de devolver 400, pero el `UPDATE`
del servicio nunca escribía la columna: respondía 200 y no hacía nada, en silencio. El DTO y el
servicio además se contradecían por comentario.

**Decisión: el tipo SÍ se puede corregir después de publicar.** Un comunicado con el tipo
equivocado se enmienda; la alternativa era borrarlo y rehacerlo, que le cambia el id, lo
reordena y lo devuelve a "no leído" para todo el mundo por una errata de un campo.

Hecho: el `UPDATE` escribe `tipo`, el comentario contradictorio se fue, y cambiar el tipo marca
`editadoEn` (es una enmienda que el lector ve, no metadatos). Cubierto por
`admin-editar.spec.ts`, que afirma el estado final de la fila — no el código de respuesta.

---

## 4. Los respaldos **sí** corren

Desde el **12 de mayo de 2026**. El panel mostraba "Nunca" hasta que se corrigió — era el panel
el que estaba mal, no el respaldo. Si alguien vuelve a ver "Nunca", verificar antes de asumir
que no hay backups.

Relacionado: los scripts de respaldo ahora se suben en cada deploy. Antes vivían en
`/home/ubuntu/scripts/` solo si alguien los había copiado a mano en su día.

---

## Ver también

- [`reglas-deploy.md`](reglas-deploy.md) — obligatorio antes de cada push
- [`roles-permisos.md`](roles-permisos.md) · [`auditoria-arquitectura.md`](auditoria-arquitectura.md) · [`auditoria-configuracion.md`](auditoria-configuracion.md) · [`auditoria-mobile.md`](auditoria-mobile.md)
