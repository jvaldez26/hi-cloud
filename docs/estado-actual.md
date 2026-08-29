# Estado actual

> Lo que necesita saber quien retoma esto mañana. No es un changelog — el `git log` ya cuenta
> qué cambió. Esto cuenta **qué está a medias, qué no es obvio desde el código y qué no hay
> que volver a decidir.**
>
> **Última actualización: 2026-08-26** · HEAD `197ee701`
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

**Qué pasó.** El cierre de caja reúne las ventas por `vendedorId + fecha`. Una factura con
`vendedorId` NULL **desaparece de todos los cuadres sin avisar**. Nadie lo vio durante un mes
porque la validación de caja estaba envuelta en un `if (factura.vendedorId)`: justo la factura
rota era la única que nadie miraba.

- **Causa: no es una sola.** El commit `2fa2586d` (17 de agosto) disparó el brote de agosto en el
  POS, pero **hay siete caminos que crean facturas y ninguno resuelve el vendedor** (ver abajo).
  Por eso hay huérfanas desde junio, meses antes de ese commit.
- **Alcance:** **249 facturas en 11 empresas** — verificado contra producción el 2026-08-26.
- **Caso urgente:** caja #446 de FERRETERÍA PAVEL — 5 de 16 facturas, RD$16,574.99 fuera del
  arqueo. Ya resuelto con un backfill acotado a esas 5.

### Las tres fases

| Fase | Qué es | Estado |
|---|---|---|
| **1 — Backend** | `resolverVendedor()`: el vendedor se deriva del usuario autenticado, no se acepta del navegador | ✅ **Desplegada** (`f7dc2763`) — pero **solo cubre `create()`** |
| **2 — POS** | Fix del frontend para que no dependa del `localStorage` | ❌ **Sin pushear** — solo existe en la otra máquina |
| **3 — Backfill** | Script para recuperar las facturas huérfanas | ❌ **Sin pushear** — solo existe en la otra máquina |

> ⚠️ **Fases 2 y 3 no están en ningún remoto.** Se verificó: no están en `origin/main` ni en
> `origin/worktree-agent-abf8e6ad46f3b89c8` (esa rama está *detrás* de main, ya fusionada).
> **No las reescribas** — hay que traerlas de la otra máquina.

### Las huérfanas que quedan — 249 en 11 empresas

Consultado en producción el **2026-08-26**:

| Empresa | Facturas | Dato relevante |
|---|---:|---|
| MOTO REPUESTO MANOLIN (empresa 42) | 158 | sigue generando; usuario sin vendedor asociado |
| R&M | 41 | **arranca el 27 de junio** — anterior a `2fa2586d` |
| VALDEZ GONZÁLEZ | 12 | |
| MULTISERVICIOS | 10 | |
| GRUPO SUS | 9 | RD$287,982 |
| LUBRI GOMAS | 7 | RD$424,770 |
| PRO LIMPIA | 5 | |
| MÉLIDA RODRÍGUEZ | 4 | **una es de hoy (26-ago)** — ver abajo |
| FERRETERÍA PAVEL (empresa 61) | 1 | RD$217,323 en **una sola factura** del 4 de agosto |
| ANT ROS | 1 | **arranca el 27 de julio** — anterior a `2fa2586d` |
| ALEX SAZÓN | 1 | |
| **Total** | **249** | |

La cifra que circulaba antes (163 en agosto, ~158 restantes) medía **un solo mes y una sola vía**.
El problema es más viejo y más ancho que eso.

La de PAVEL **sí es recuperable hoy**: la empresa 61 es la única con `vendedores."usuarioId"`
poblado, así que el backfill puede derivarle el vendedor desde `usuarioId`. Las otras 248 no,
mientras esa columna siga vacía en sus empresas.

### Por qué Fase 1 no las cubre — siete caminos, un solo guardián

`resolverVendedor()` vive **únicamente** en `facturas.service.ts:500`, dentro de `create()`.
Todos estos otros crean facturas sin pasar por ahí y **ninguno escribe `vendedorId`**:

| Camino | Dónde | Cómo se reconoce la factura |
|---|---|---|
| Convertir cotización | `cotizaciones.service.ts:191` | `notas` = «Convertida desde cotización …» |
| Pre-factura → factura | `pre-factura.service.ts:253` | folio `FAC-<n>`, estado `emitida`, `tipoNcf` E32 |
| Contrato (cron y manual) | `contratos.service.ts:147` | `notas` = «Contrato …» |
| Orden de servicio | `servicios.service.ts:223` | `notas` = «Servicio técnico: …» |
| Factura recurrente (cron) | `facturas-recurrentes.service.ts:199` | `facturaRecurrenteId` no nulo |
| Comanda de restaurante | `restaurante.service.ts:639` | `INSERT` crudo; hay fila en `rs_comandas` |
| **Duplicar factura** | `facturas.service.ts:1522` | copia todo menos el vendedor |

`duplicar()` es el más traicionero: copia cliente, moneda, `tipoNcf`, `tipoPago`, notas y
detalles — y deja fuera `vendedorId`. Duplicar una factura bien atribuida produce una huérfana.

Los siete son anteriores a `2fa2586d` por meses y explican las huérfanas de junio y julio.

**Consulta para clasificar las 249 por origen** (read-only):

```sql
SELECT f."empresaId",
       CASE
         WHEN f."facturaRecurrenteId" IS NOT NULL           THEN 'recurrente'
         WHEN f.notas LIKE 'Convertida desde cotización%'   THEN 'cotizacion'
         WHEN f.notas LIKE 'Contrato %'                     THEN 'contrato'
         WHEN f.notas LIKE 'Servicio técnico:%'             THEN 'servicios'
         WHEN f.notas LIKE 'Factura recurrente:%'           THEN 'recurrente'
         WHEN EXISTS (SELECT 1 FROM rs_comandas c WHERE c."facturaId" = f.id)
                                                            THEN 'restaurante'
         ELSE 'create() o duplicar()'
       END                            AS origen,
       COUNT(*)                       AS facturas,
       MIN(f.fecha)                   AS desde,
       MAX(f.fecha)                   AS hasta,
       ROUND(SUM(f.total)::numeric,2) AS monto
  FROM facturas f
 WHERE f."vendedorId" IS NULL
   AND f.estado <> 'anulada'
 GROUP BY 1, 2
 ORDER BY facturas DESC;
```

### Pendiente de comprobar: la huérfana de hoy (MÉLIDA RODRÍGUEZ, 26-ago)

Con Fase 1 desplegada, una huérfana nueva solo puede venir de dos sitios, y la diferencia decide
si esto está funcionando o sigue roto:

1. **La rama documentada** — usuario sin vendedor asociado. `resolverVendedor()` no tiene de
   dónde derivar, la factura se emite igual (nunca se bloquea una venta) y **queda registrada**.
   Funciona como se diseñó; lo que corta este caso es Fase 2.
2. **Uno de los siete caminos de arriba** — no se registró nada y nadie se enteró.

**Cómo distinguirlas:** si fue (1) hay un evento en Sentry con tag `facturas.sinVendedor` para
esa empresa con fecha `2026-08-26` — lo emite `emitirAlertaSinVendedor()`
(`facturas.service.ts:185`), agrupado por empresa y día. Si no hay evento, fue (2).

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
faltan — que **no son cuatro sino once**, ver el conteo del 26-ago en la sección 1. Ahí
`resolverVendedor()` siempre resuelve, esa rama deja de alcanzarse sola, y recién entonces
tiene sentido. Mientras tanto lo que se necesita es visibilidad, y la da la alerta agrupada por
empresa y día de `acumularFacturaSinVendedor()`
— agrupada, porque siete avisos diarios se vuelven ruido que nadie mira en una semana.

Ojo: endurecer `create()` tampoco bastaría por sí solo. Los otros seis caminos de la sección 1
seguirían creando facturas sin vendedor por su cuenta.

### En PDFKit, `lineBreak: false` y `ellipsis: true` **no** impiden que el texto envuelva

Si vas a escribir una tabla en PDFKit, lee esto antes. Es contraintuitivo y ya se escribió mal
tres veces: en `factura-pdf.helper.ts`, en `documento-pdf.helper.ts` y en `nota-pdf.helper.ts`.
Las tres tenían la columna de ITBIS partiendo `RD$ 180.00` en dos líneas.

| Opción | Lo que parece que hace | Lo que hace de verdad |
|---|---|---|
| `lineBreak: false` | desactivar el envolvido | solo se salta el cálculo del `width` por defecto. Si le pasas un `width` explícito —y se lo pasas, porque hace falta para `align: 'right'`— el `LineWrapper` entra igual y parte por el espacio |
| `ellipsis: true` | recortar lo que no quepa a lo ancho | solo se dispara al topar el límite de **altura**. Sin `height` no hace absolutamente nada |

Lo único que resuelve una celda en **una sola línea** es pasar las dos juntas:

```ts
doc.text(txt, x, y, { width, align, lineBreak: false, height: altoDeUnaLinea, ellipsis: true });
```

Que es lo que encapsula `celdaSinEnvolver()` en `common/pdf/columnas-numericas.helper.ts`. Úsalo,
no lo escribas a mano.

**Por qué importa tanto:** un importe partido en dos líneas se lee como un dato roto, y con
`RD$ ` delante pasa antes de lo que parece — la columna de ITBIS daba 43pt de texto y
`RD$ 180.00` ya ocupa 45.36pt a Helvetica 8.5. Y si la tabla tiene la **altura de fila fija**
(`compras-pdf.service.ts`, `tabular-pdf.helper.ts`), la segunda línea no ensancha la fila: se
dibuja **encima de la siguiente**. Un documento solapado es peor que uno recortado.

**Cómo se prueba:** no con aserciones sobre el cálculo de anchos — eso comprueba la aritmética
del propio test. Hay que mirar el render: descomprimir el content stream, extraer los fragmentos
de texto con su posición y agruparlos por línea base. La firma de un importe partido es un
fragmento que contiene solo `RD$ `. Está en `common/pdf/inspeccion-pdf.testing.ts`.

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

## 5. Columnas de tabla: la preferencia y el móvil

La preferencia de columnas (`useColumnVisibility` + `ColumnToggle`, 126 tablas) guarda **los
cambios respecto al default**, no la lista de visibles. Guardando las visibles, cada columna
nueva quedaba oculta para todo el que hubiera tocado el selector alguna vez — y como estaba
oculta no la veía, y como no la veía no sabía que existía para poder activarla.

Son dos listas (`ocultas` y `mostradas`) porque hay 147 columnas declaradas
`defaultVisible: false` en 84 páginas: con una sola lista, esas empezarían a aparecer, que es el
mismo bug al revés. Reglas verificadas en `npm run verificar:columnas`.

**Cuando se retome el móvil de Super Admin** — hoy no tiene ninguno: ni `isMobile`, ni tarjetas;
sus tablas hacen scroll horizontal — el diseño acordado es:

- **La tarjeta CONSUME la preferencia, no compite con ella.** La línea secundaria de cada
  tarjeta sale de las columnas visibles; las fijas (identidad de la fila y acciones) van
  siempre. Una sola lista manda sobre las dos vistas.
- **Una clave por tabla, nunca por viewport.** Si la preferencia se guardara distinta en móvil y
  en escritorio, el resultado es "en el teléfono me salen otras columnas", que es una llamada de
  soporte garantizada.
- **Mientras no haya tarjetas, el selector se muestra igual**: la tabla con scroll horizontal es
  justo donde más sirve poder quitar columnas. Precedente en `FacturasPage`, donde
  `filterColumns` se aplica a la tabla y la tarjeta lo ignora, sin romper nada.

### Pendiente: las columnas que no están en su `COLS_DEF`

Hay columnas declaradas en tablas que NO aparecen en el `COLS_DEF` de su página. `filterColumns`
solo muestra lo que está en esa lista, así que **hoy no las ve nadie y no hay forma de
activarlas**. Sigue ignorándolas a propósito: sacarlas a la luz es un cambio visible en varias
páginas del ERP y va en su propio commit, con captura.

**Ojo al contarlas — un conteo automático da un número inflado.** Un barrido con regex sobre
`key:` dio 48 páginas, y estaba mal: casi todo eran `key` de items dentro de `TableActions`
(`editar`, `eliminar`, `pdf`, `aprobar`, `anular`…), que viven en el `render` de la columna de
acciones y no son columnas. Se verificó en `ProductosPage`: sus supuestas columnas huérfanas
`editar` y `eliminar` son entradas del menú de acciones.

Las huérfanas de verdad son sustantivos (`tipoCredito`, `baja`, `cli`, `var`), no verbos. Antes
de tocar nada hace falta **una pasada manual** tabla por tabla; no fiarse del barrido.

---

## Ver también

- [`reglas-deploy.md`](reglas-deploy.md) — obligatorio antes de cada push
- [`roles-permisos.md`](roles-permisos.md) · [`auditoria-arquitectura.md`](auditoria-arquitectura.md) · [`auditoria-configuracion.md`](auditoria-configuracion.md) · [`auditoria-mobile.md`](auditoria-mobile.md)
