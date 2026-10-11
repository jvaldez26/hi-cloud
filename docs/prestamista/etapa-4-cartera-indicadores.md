# Prestamista Etapa 4 — Cartera e indicadores — nota de diseño

**Estado: CERRADO el 2026-10-11.** Ver "Resumen (cerrado 2026-10-11)" al
final del documento.

Igual que Cobranza (Etapa 3), esta etapa **no partió de cero**: ya existían
`DashboardPrestamistaService`/`DashboardPrestamistaController` (KPIs) y
`ReportesPrestamistaService`/`ReportesController` (12 endpoints CSV),
construidos antes de la convención de documentar por etapas, con el
frontend (`DashboardPrestamistaPage.tsx`, `ReportesPrestamistaPage.tsx`) ya
conectado al menú real. Este documento parte de una auditoría línea por
línea de ese código — no de una lista de features en blanco.

---

## 1. Auditoría — qué había y qué faltaba

### 1.1 Fuga multi-tenant — SÍ se encontró, en 2 métodos de `reportes.service.ts`

El pedido explícito de esta etapa era revisar cada uno de los 12 métodos de
`reportes.service.ts` buscando exactamente la clase de bug que ya pasó en
`balance-comprobacion.service.ts`, `presupuestos.service.ts` y el módulo
608: un JOIN/subquery que olvida filtrar por `empresaId` aunque el `WHERE`
principal sí lo tenga. Se encontraron **3 JOIN** en 2 métodos (más un
tercero compartiendo el mismo patrón) que no filtraban por empresa:

1. **`carteraActiva()`** — `LEFT JOIN pr_productos_prestamo pr ON pr.id=p."productoId"`
   (sin `AND pr."empresaId"=p."empresaId"`).
2. **`prestamosPorProducto()`** — el mismo JOIN, mismo hueco.
3. **`estadoCuentaDeudor()`** — `LEFT JOIN pr_pagos pg ON pg."prestamoId"=p.id`
   (sin `AND pg."empresaId"=p."empresaId"`).

**¿Explotable hoy?** No de forma directa: `productoId` y `prestamoId` son
columnas que solo se escriben desde dentro de la misma empresa (un
préstamo siempre se crea con un producto de su propia empresa; un pago
siempre se crea contra un préstamo de su propia empresa), y los `id` son
seriales globales de Postgres, no reiniciados por tenant — así que hoy no
hay un camino real por el que `p."productoId"` de la empresa 1 apunte a un
producto de la empresa 2. **Pero es exactamente la misma clase de bug ya
cerrada dos veces en este backend** (balance, presupuestos, 608): un JOIN
sin el filtro de empresa es una fuga latente que solo necesita una
condición futura (datos corruptos, un bug en otro lado que deje un
`productoId`/`prestamoId` apuntando a la empresa equivocada, un cambio de
esquema) para volverse real. El resto de los JOIN de `reportes.service.ts`
(`pr_deudores`, `pr_prestamos` en dos niveles, `pr_cobranzas`, etc.) **sí**
llevan el filtro `AND tabla."empresaId"=otra."empresaId"` en cada uno — son
los 3 los que quedaron inconsistentes con el propio patrón del archivo.

**[CORREGIDO — prioridad de seguridad, no de mejora]** Se agregó el filtro
de empresa a los 3 JOIN. Commit aparte, antes que cualquier otro cambio de
esta etapa. Tests nuevos con fixtures **adversariales** que reproducen el
escenario exacto (un producto que solo existe en la empresa 2 referenciado
desde un préstamo de la empresa 1; un pago con `empresaId=2` sobre un
préstamo de la empresa 1) para que una regresión futura del fix falle la
suite inmediatamente — ver §3.

`dashboard.service.ts` (6 queries) se auditó con la misma lupa: **todos**
sus JOIN ya llevaban el filtro de empresa correcto (incluido el JOIN
`pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"`
de `topDeudores`). Sin hallazgos ahí.

### 1.2 Cálculo financiero sospechoso — el "Índice de Morosidad" de reportes NO coincidía con el de Cobranza

El pedido pedía revisar con cuidado si los índices financieros calculan lo
que dicen calcular. `indicesFinancieros()` definía:

```
indiceMorosidad = (saldoMora total / saldoCapital total) * 100
```

Es decir, "mora acumulada (recargos por atraso) como % del capital
pendiente" — una métrica real, pero **no** una tasa de morosidad/cartera en
riesgo. Mientras tanto, `CobranzaService.resumenCobranza()` (Etapa 3, ya en
producción) calcula un `indiceMorosidad` **distinto** para el mismo
concepto:

```
indiceMorosidad = (préstamos en moroso+vencido / préstamos activos) * 100
```

Esta segunda fórmula es la correcta para "índice de morosidad" en el
sentido que se usa en microfinanzas (% de la cartera activa que está en
mora), y es la que ya ve el cobrador en su propio resumen. Tener el **mismo
nombre** calculando **cosas distintas** en dos reportes del mismo módulo es
el tipo de inconsistencia que generaría un número que nunca cierra entre
"Reportes" y "Cobranza" si alguien los compara — y una división por capital
en vez de por conteo de préstamos puede además esconder un número pequeño
cuando hay pocos préstamos grandes en mora temprana (mora acumulada todavía
baja) mezclado con muchos préstamos pequeños vencidos (que sí deberían
pesar en el índice).

**[CORREGIDO]** `indicesFinancieros()` ahora calcula `indiceMorosidad` con
la MISMA fórmula que `CobranzaService.resumenCobranza()` (réplica exacta:
% de préstamos activos —ni pagados ni cancelados— que están en
moroso/vencido). La fórmula vieja (mora acumulada / saldo capital) se
conserva como un campo separado, `moraSobreCartera`, con su propio nombre
en el CSV — es una métrica real y útil (qué tan pesada es la mora frente al
capital pendiente), solo que no es "el índice de morosidad". Ninguna
división por cero: ambas fórmulas usan guardas (`> 0 ? ... : '0.0'`/`'0.00'`),
y se agregó un test explícito de "sin préstamos" para confirmarlo.

### 1.3 Exportación — ya existía, no había que construir nada

El pedido pedía revisar si los reportes son exportables, comparando con el
patrón de Caja/Facturas. Los 12 endpoints de `reportes.controller.ts` ya
devuelven CSV (`descargarReporte()` en `prestamista.api.ts`: axios con
`responseType: 'blob'` → `URL.createObjectURL` → click). Es un patrón más
liviano que el Excel con `exceljs` que usa `reportes-financieros/` (Balance
General, Estado de Resultados, Flujo de Efectivo), pero funcionalmente
equivalente para el caso de uso (abre en Excel/LibreOffice igual) y ya está
probado en producción por Cobranza (Etapa 3, cartera vencida con Excel vía
`exportarExcel()`, que es un camino distinto, local, para tablas ya
cargadas en el navegador — no hacía falta unificarlos). **No se construyó
nada nuevo en exportación.**

### 1.4 Ruteo — Dashboard y Reportes SÍ son navegables, sin gaps

`App.tsx` registra `DashboardPrestamistaPage` como la ruta `index` de
`/prestamista` y `ReportesPrestamistaPage` en `/prestamista/reportes`;
`menuConfig.ts` tiene ambos en el menú del módulo (`PR01` "Panel" y `PR09`
"Reportes"). Un usuario real llega a las dos pantallas sin pasos ocultos.

**Hallazgo menor**: el endpoint 12 (`GET estado-cuenta-deudor/:deudorId`,
CSV con el historial completo de préstamos+pagos de un deudor para uso
contable) **no tenía ningún botón en el frontend** — existía en el backend
y en `reportes.controller.ts` pero huérfano. (Distinto del botón
"Estado de Cuenta PDF" que ya existía en `FichaDeudorPage.tsx`: ese llama a
`GET /prestamista/pdf/estado-cuenta/:deudorId`, un PDF con diseño para
entregarle al deudor — un endpoint y un propósito totalmente distintos al
CSV de auditoría contable.) **[CORREGIDO]** Se agregó un botón "CSV
completo (contable)" junto al de PDF en la tab "Estado de Cuenta" de
`FichaDeudorPage.tsx`, reusando `descargarReporte()` (mismo mecanismo que
`ReportesPrestamistaPage.tsx`).

### 1.5 Paginación/límites — revisado, sin cambios

`cartera-activa` y `deudores-saldos` devuelven todas las filas sin
paginar. **No se trata como bug**: son endpoints de **exportación CSV**
(`responseType: 'blob'`, se descargan completos para abrir en Excel), no
listados paginados de una grilla — exactamente el mismo criterio que usan
`reportes-financieros/` y el resto de los reportes de analítica del ERP. Un
listado paginado de la cartera para navegar en pantalla ya existe aparte,
en `/prestamista/prestamos` (`PrestamosPage`, fuera del alcance de esta
auditoría) y en `CobranzaPage` (Etapa 3) para la cartera vencida. Si algún
tenant llega a tener una cartera de decenas de miles de préstamos, el CSV
completo sigue siendo correcto semánticamente (es un reporte, no una
grilla) — el único riesgo sería de memoria/tiempo de respuesta en un volumen
extremo, no cubierto todavía; ver `decisiones-pendientes.md`.

### 1.6 `estado-cuenta-deudor`: verificación cruzada adicional

Al escribir el test de este endpoint se encontró que **no valida que el
`deudorId` pertenezca a la empresa** antes de buscar sus préstamos — pero
como el `WHERE` ya exige `p."empresaId"=$1 AND p."deudorId"=$2`, un
`deudorId` de otra empresa simplemente no matchea ningún préstamo y
devuelve un CSV vacío (no un error, pero tampoco datos ajenos). Se agregó
un test que confirma este comportamiento explícitamente — no es una fuga,
pero vale dejarlo verificado y no solo supuesto.

---

## 2. Qué se construyó/corrigió

1. **Fix de fuga multi-tenant** en `reportes.service.ts` — 3 JOIN
   (`carteraActiva`, `prestamosPorProducto`, `estadoCuentaDeudor`) ganan el
   filtro `AND tabla."empresaId"=otra."empresaId"` que le faltaba. Commit
   propio, con prioridad de seguridad.
2. **Fix del índice de morosidad** en `indicesFinancieros()` — ahora
   replica la fórmula de `CobranzaService.resumenCobranza()` (% de
   préstamos activos en mora, no mora/capital). La fórmula vieja se
   conserva como `moraSobreCartera`, con su propio nombre en el CSV.
3. **Botón nuevo** en `FichaDeudorPage.tsx` ("CSV completo (contable)")
   para que el endpoint 12 (`estado-cuenta-deudor`) deje de estar huérfano.
4. **27 tests nuevos** — ver §3. `dashboard.service.ts` y
   `reportes.service.ts` pasan de 0 a cobertura completa (todas las queries,
   los 12 endpoints, aislamiento multi-tenant explícito en cada uno).

### 2.1 Lo que NO se tocó a propósito

- **Exportación** — ya existía (CSV), no hacía falta Excel ni ningún
  formato nuevo.
- **Paginación de `cartera-activa`/`deudores-saldos`** — son exports
  completos por diseño, no grillas; no se agregó límite.
- **Umbrales de "cartera en riesgo" (PAR 30/60/90)** — el pedido mencionaba
  revisar si existía algo así. No existe un PAR30/60/90 explícito (capital
  en mora de 30+/60+/90+ días sobre capital total) en ningún reporte — la
  distribución de mora del Dashboard (`distribucionMora`, por buckets de
  días) es la pieza más cercana, y ya existía. No se construyó un PAR
  nuevo — ver `decisiones-pendientes.md` si se necesita para una financiera
  que lo exija por regulación.
- **Catálogo de features nuevas** (gráficas nuevas, KPIs adicionales,
  filtros nuevos en el Dashboard) — el pedido fue explícito en no inventar
  features de catálogo sin un gap real detrás; no se agregó nada que no
  resolviera un hallazgo de la auditoría.

---

## 3. Tests

Mismo patrón que `cobranza.service.spec.ts` (Etapa 3): un `DataSource`
simulado (`jest.fn` sobre `ds.query`, dispatcher por substring de SQL, no un
parser) con datos de **dos empresas** para cada servicio.

- **`dashboard/dashboard.service.spec.ts`** (7 tests, nuevo) — los 6 queries
  de `getKpis()` con fixtures de 2 empresas: KPIs principales, aislamiento
  entre empresas, conteo de deudores (incluida lista negra), agrupación de
  solicitudes por estado, distribución de mora por buckets, recaudación
  mensual, y top deudores morosos (orden + límite + exclusión de la otra
  empresa).
- **`reportes/reportes.service.spec.ts`** (14 tests, nuevo) — uno por cada
  uno de los 12 endpoints, más 2 adicionales para `estadoCuentaDeudor`
  (pago cruzado + deudor de otra empresa) y 1 extra de "sin préstamos" para
  `indicesFinancieros`. Dos de los fixtures son **adversariales a
  propósito**, reproduciendo el escenario exacto de las fugas corregidas en
  §1.1:
  - un préstamo de la empresa 1 que referencia un `productoId` que solo
    existe bajo la empresa 2 (`carteraActiva`/`prestamosPorProducto` deben
    devolver el producto vacío, nunca el nombre ajeno);
  - un pago con `empresaId=2` sobre un préstamo de la empresa 1
    (`estadoCuentaDeudor` nunca debe incluirlo).

  Si alguien revierte alguno de los 3 fixes del JOIN, estos tests fallan de
  inmediato.

---

## Decisiones pendientes anotadas en `decisiones-pendientes.md`

| # | Decisión sin cerrar | Default aplicado |
|---|---|---|
| 1 | PAR30/60/90 (cartera en riesgo por antigüedad de capital, no de conteo) | No existe hoy; la distribución de mora por días (Dashboard) es lo más cercano |
| 2 | Límite/paginación en `cartera-activa`/`deudores-saldos` para carteras extremadamente grandes | Sin límite — son exports CSV completos por diseño, igual que el resto del ERP |

---

## Resumen (cerrado 2026-10-11)

Auditoría línea por línea de `dashboard.service.ts` (6 queries) y
`reportes.service.ts` (12 endpoints), ambos sin ningún test antes de esta
sesión. Se encontró y corrigió una **fuga multi-tenant real** (3 JOIN sin
filtro de empresa en `carteraActiva`, `prestamosPorProducto` y
`estadoCuentaDeudor` — no explotable con los datos de hoy por cómo se
escriben esas columnas, pero la misma clase de bug ya cerrada en
`balance-comprobacion.service.ts`/`presupuestos.service.ts`/608) y un
**cálculo financiero inconsistente** (el "Índice de Morosidad" de Reportes
no coincidía con el de Cobranza — fórmulas distintas con el mismo nombre).
Se corrigió también un endpoint huérfano (`estado-cuenta-deudor` sin botón
en el frontend). Exportación, ruteo y paginación se revisaron y no
necesitaban cambios.

**Backend**: `reportes.service.ts` — 3 JOIN corregidos + `indicesFinancieros()`
reescrito con la fórmula correcta de morosidad + `moraSobreCartera` como
métrica aparte. `dashboard.service.ts` sin cambios (auditado, sin
hallazgos).

**Frontend**: `FichaDeudorPage.tsx` gana el botón "CSV completo (contable)"
en la tab "Estado de Cuenta".

**Tests**: 21 nuevos (7 en `dashboard.service.spec.ts` + 14 en
`reportes.service.spec.ts`). Backend: 4900 tests en verde (+21 sobre los
4879 de Etapa 3). Frontend: `npx tsc --noEmit` limpio; la suite completa de
Vitest tuvo el mismo fallo por timeout (no causado por este cambio) en
`SelectClienteConAlta.test.tsx` ya documentado en `etapa-3-cobranza.md` y en
`feedback_deuda_test_nc_compras_lento` (memoria del usuario) — 672/673 en
verde, el archivo no se tocó en esta sesión.

Commits: 1 fix de la fuga multi-tenant (prioridad de seguridad), 1 fix del
índice de morosidad, 1 feature del botón CSV en `FichaDeudorPage`, 1 de
tests, 1 de docs. Todo pusheado a `origin/feat/prestamista-motor`.

No se empezó Etapa 5 (Contabilidad/caja/fiscal).
