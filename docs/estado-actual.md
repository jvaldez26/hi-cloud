# Estado actual

> Lo que necesita saber quien retoma esto mañana. No es un changelog — el `git log` ya cuenta
> qué cambió. Esto cuenta **qué está a medias, qué no es obvio desde el código y qué no hay
> que volver a decidir.**
>
> **Última actualización: 2026-08-26** · HEAD `d22e5cb8`
> Al cerrar o abrir un trabajo, actualizá la sección y la fecha de arriba.

---

## ⚠️ Antes que nada: hay dos árboles de backend y uno está muerto

**El que se despliega es `hi-cloud backend-project/backend`.** Lo dicen
`docker-compose.yml` (`context: ./hi-cloud backend-project/backend`) y
[`reglas-deploy.md`](reglas-deploy.md).

**`backend/` está congelado desde el 4 de julio de 2026** (`714b175e`). No se compila, no se
despliega y no se borra. Tiene la misma estructura de carpetas y casi los mismos nombres de
archivo, así que **parece el bueno**: quien abra `backend/src/configuracion/...` está leyendo
código que **no existe en producción**, y no hay nada en el archivo que se lo avise.

Ya ha costado tiempo más de una vez. Ejemplo real: en `backend/` la plantilla
`recibo-termico.template.ts` no la usa nadie y parece borrable entera; en el árbol vivo el
mismo archivo exporta el tipo `ReciboPOSData` del que cuelgan cuatro módulos. Misma ruta
relativa, misma pinta, conclusión opuesta.

**Regla:** toda ruta de backend en un informe, un ticket o un commit se escribe completa,
empezando por `hi-cloud backend-project/backend/`. Si ves una ruta que empieza por `backend/`
a secas, desconfía antes de actuar sobre ella.

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

### La térmica no imprime acentos — sin arreglar, a propósito

`DESCRIPCIÓN` sale `DESCRIPCION` en toda impresión por Bluetooth, y lleva así desde
siempre. La causa está en `sanear()` (`src/services/thermalPrinter.ts`): el texto se manda
con `TextEncoder`, que emite **UTF-8**, y estas impresoras leen **CP437**. Un `Ó` en UTF-8
son dos bytes y la impresora los pinta como dos símbolos basura, así que `sanear()` los
descompone y borra la tilde antes de mandarlos. Feo, pero legible.

**El arreglo de verdad no es tocar la plantilla.** CP437 **sí tiene** `á é í ó ú ñ Ñ`. Hay
que dejar de mandar UTF-8: una tabla de traducción de ~128 entradas, codificar a bytes CP437
y seleccionar la página de códigos con `ESC t` al inicializar. Unas 40 líneas.

**Por qué no se ha hecho:**

- Cambia **toda** impresión térmica de **todos** los clientes: tickets, conduces, cierres de
  caja, recibos de cobro. No es un cambio acotado.
- Hay que probarlo en una **BT-58UB real**. `ESC t` acepta distintos números de página según
  el firmware y hay clones que lo ignoran; si se elige la página equivocada, los acentos
  salen peor que ahora, no mejor. Eso no se sabe hasta que sale en papel.
- Lo que hoy se pierde es cosmético y **no toca ningún campo exigible por la DGII**: el
  e-NCF, el código de seguridad, el RNC y los montos son ASCII de nacimiento.

**Qué NO hacer mientras tanto:** quitar los acentos de la plantilla para que los dos caminos
coincidan. El ticket del navegador es una página rasterizada y los imprime perfectamente; no
se empobrece el camino bueno para igualarlo al limitado. Ese es el mismo criterio por el que
el `×` de la línea de cantidad, el `⚠` del comprobante en proceso, los iconos de módulo y la
marca de pesable `⚖` **se quedan en el HTML** y es `sanear()` quien los baja a ASCII solo de
camino al Bluetooth.

La excepción es el separador del formato compacto: ahí se eligió un guion ASCII en los dos
caminos a propósito, porque aparece en casi todas las líneas y verlo distinto según la
impresora confunde — sobre todo cuando el cliente manda una foto del ticket.

### `posTipoImpresora` es global — bug vivo, sin arreglar

La configuración del POS vive entera en `empresa.configuracion` (JSONB), **una sola fila por
empresa**. Entre esas claves está `posTipoImpresora` (`58mm` / `80mm` / `bluetooth` / `carta` /
`ninguna`), que decide el ancho del papel y la tipografía del ticket (`IMPRESORA_CONFIG` en
`src/utils/docTermico.ts`).

**Un cliente con una térmica de 58mm en una sucursal y una de 80mm en otra no tiene forma de
configurarlo.** El POS lee el valor de la empresa y lo aplica igual en las dos: una de las dos
imprime siempre con el ancho equivocado. No hay override por sucursal ni por dispositivo — el
POS ya sabe en qué sucursal está (`authStore.sucursalActual`), pero nunca lo consulta para
elegir impresora.

Esto **no lo causó** el modo compacto del ticket: es anterior y sigue ahí después.

**Por qué no se arregló de una vez.** `sucursales` no tiene columna `configuracion`, así que el
override por sucursal necesita una migración SQL a mano (no hay carpeta de migrations en el
proyecto — ver `backend/scripts/generate-migration.js` y su regla de camelCase). Se decidió
dejarlo fuera del alcance de ese trabajo en vez de colar una migración de contrabando.

**La puerta quedó abierta.** El ticket se configura a través de
`resolverConfigTicket(empresa, sucursal)` (`src/utils/configTicket.ts`), que hoy se llama
siempre con `sucursal = null`. Añadir la capa de sucursal es rellenar esa función y darle el
dato: no hay que tocar los sitios que imprimen.

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
