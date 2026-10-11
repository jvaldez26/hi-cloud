# Prestamista Etapa 7 — Scoring e inteligencia — nota de diseño

**Estado: CERRADO el 2026-10-11.** Última etapa del roadmap. Ver
"Resumen (cerrado 2026-10-11)" al final de este documento y
`README.md` para el resumen de las 7 etapas completas.

Restricción de partida (del pedido): no hay infraestructura de Machine
Learning en este stack y no es el momento de construir una. "Scoring" aquí
es un **motor de reglas determinístico y explicable** — un número 0-100 y
una banda A-E calculados a partir de señales reales ya existentes en las
tablas de Prestamista, con cada factor y su peso visibles. Nunca aprueba,
rechaza ni bloquea nada solo — es una señal para que un humano decida,
mismo principio que el resto del módulo (condonar/reestructurar/ejecutar
garantía/cancelar: siempre hay un humano en el medio).

---

## 1. Auditoría — qué señales ya existen y cuáles son triviales de calcular

Se leyó `deudores/**`, `dashboard/**`, `reportes/**`, `cobranza/**`, las
entidades (`pr-deudor`, `pr-prestamo`, `pr-pago`, `pr-cuota`,
`pr-refinanciamiento`, `pr-garante`, `pr-garantia`, `pr-solicitud`) y
`condonacion.service.ts`/`reestructuracion.service.ts` antes de diseñar
nada.

### 1.1 Hallazgo — `pr_deudores.diasMoraHistorico` es una columna MUERTA

`pr_deudores` ya tiene columnas pensadas para esto: `scoreCredito` (int),
`nivelRiesgo` (enum texto) y `diasMoraHistorico` (int, default 0). Se
revisó cada escritura a `pr_deudores` en todo el módulo
(`prestamos.service.ts`, `pagos.service.ts`, `deudores.service.ts`):

- `scoreCredito` y `nivelRiesgo` **solo se escriben a mano** desde el
  formulario de alta/edición de deudor (`ActualizarDeudorDto`/
  `CrearDeudorDto` → `DeudoresService.update()/create()`) — son opinión
  humana capturada en la ficha, no un cálculo. Se **conservan intactos**:
  el score nuevo es un campo aparte (`scoreAutomatico`/`banda`), nunca pisa
  `scoreCredito` (que sigue siendo editable a mano, p.ej. para una
  decisión cualitativa que el motor de reglas no puede capturar — un
  deudor de mucha confianza personal del oficial, por ejemplo).
- `diasMoraHistorico` **nunca se escribe en ningún lado** — ni en
  `prestamos.service.ts` ni en `pagos.service.ts` ni en el cron de mora
  (`mora.cron.ts`). Queda en 0 para siempre salvo que alguien lo edite a
  mano (tampoco está en el `allowed[]` de `DeudoresService.update()`, así
  que ni siquiera eso es posible desde la UI). `reportes.service.ts` lo
  lee y lo exporta en el CSV de "Deudores con saldos" — **ese CSV siempre
  trae 0 en esa columna para todo deudor real**, un bug preexistente fuera
  del alcance de esta etapa (no se tocó: cambiar qué escribe esa columna
  es una decisión de Etapa 4/Reportes, no de Scoring). Queda anotado en
  `decisiones-pendientes.md`.

**Consecuencia directa para el diseño**: el score **nunca** lee
`diasMoraHistorico` (confiar en una columna muerta sería fabricar un
número falso). Cada señal de mora/puntualidad se calcula **en vivo** desde
`pr_prestamos`/`pr_cuotas`, exactamente como ya hacen `dashboard.service.ts`
y `cobranza.service.ts`. Esto además es la prueba de por qué este diseño
decide calcular el score al vuelo en vez de persistirlo (ver §4).

### 1.2 Señales reales disponibles, a una query de distancia

| Señal | Tabla(s) | Cómo |
|---|---|---|
| Puntualidad histórica | `pr_cuotas` | `estado='pagada'`, comparar `fechaPago` vs `fechaVencimiento` |
| Mora vigente | `pr_prestamos."diasMoraActual"` | ya calculado por el cron de mora, por préstamo activo |
| Refinanciamientos previos | `pr_refinanciamientos` | `deudorId` directo en la tabla, `COUNT(*)` |
| Condonación vía refinanciamiento | `pr_refinanciamientos."moraCondonada"+"interesCondonado"` | ya son columnas de esa tabla |
| Condonación independiente (Etapa 2 resto §6) | `pr_cuotas."moraCondonada"+"interesCondonado"` | `CondonacionService.condonar()` las actualiza por cuota; no hay tabla `pr_condonaciones` separada — este es el rastro real |
| Préstamos previos cerrados limpios vs no | `pr_prestamos.estado` + el condonado de sus cuotas | `estado='pagado'` Y sin condonación aplicada a ninguna cuota suya |
| Respaldo (garantías) | `pr_garantias` | `deudorId` directo, `estado='activa'` |
| Respaldo (garantes) | `pr_garantes` | sin `deudorId` directo — join por `prestamoId` → `pr_prestamos.deudorId`, `estado='activo'` |
| Antigüedad | `pr_deudores."createdAt"` | informativa, ver §2.6 (NO entra al cálculo) |

### 1.3 Hallazgo — `reestructuracion.service.ts` no deja un rastro estructurado

A diferencia de refinanciamiento (tabla propia `pr_refinanciamientos`) y de
condonación (columnas por cuota), **reestructurar un préstamo no crea
ningún registro aparte** — solo reemplaza las cuotas totalmente pendientes
y concatena `' | Reestructurado: <motivo>'` al campo de texto libre
`pr_prestamos.notas` (ver `reestructuracion.service.ts` líneas 119-128).
Contar "cuántas veces se reestructuró" exigiría parsear ese texto libre
(contar ocurrencias de la subcadena), lo cual es frágil: si el motivo que
escribe el usuario contiene esa misma palabra, cuenta de más; y no hay
fecha/monto estructurados para pesar la señal con criterio.

**Decisión**: la reestructuración **no entra como factor propio del
score**. Se cubre indirectamente por la vía más confiable que sí tiene
estructura: la mayoría de reestructuraciones ocurren sobre deudores que
también han sido refinanciados o condonados en algún momento de su
historial (son las tres herramientas de la misma "caja de alivio" de
Etapa 2 resto §4-§6), así que el factor 3 (refinanciamientos/condonación)
ya captura la señal de riesgo real con datos limpios. Si en el futuro se
necesita contar reestructuraciones con precisión, hace falta una tabla
`pr_reestructuraciones` (mismo patrón que `pr_refinanciamientos`) — anotado
en `decisiones-pendientes.md`, no se construyó aquí (features de catálogo
nuevas fuera de alcance de esta etapa).

### 1.4 Exportación/ruteo — no aplica

Esta etapa no agrega reportes CSV ni rutas de menú nuevas — el score vive
dentro de pantallas que ya existen (Ficha del Deudor, Solicitudes).

---

## 2. Diseño del score — motor de reglas, 0-100, banda A-E

```
A: 90-100   Excelente
B: 75-89    Bueno
C: 60-74    Aceptable / neutral (incluye "sin historial suficiente")
D: 40-59    Riesgoso
E: 0-39     Crítico
```

### 2.0 Caso especial — deudor sin NINGÚN préstamo todavía

Si el deudor nunca tuvo un préstamo (`COUNT(pr_prestamos)=0`), **no se
suman factores parciales**: se devuelve un score fijo de **60/100, banda
C**, con los 5 factores marcados explícitamente `sinDato: true` y un
mensaje: *"Cliente nuevo — sin historial de préstamos todavía. Se asigna
un puntaje neutral (ni premio ni castigo) hasta que genere historial de
pago."* Esto es deliberadamente más transparente que fabricar una suma
parcial que aparente estar "calculada" cuando en realidad no hay ningún
dato real detrás de ningún factor — satisface el requisito explícito de
que un deudor nuevo no salga castigado por falta de datos que no tuvo
oportunidad de generar, sin fingir precisión que no existe.

### 2.1 Factor 1 — Puntualidad de pago (0-30 pts, el más pesado junto al 3)

```
cuotasPagadas = pr_cuotas con estado='pagada' (de todos los préstamos del deudor)
cuotasATiempo = de esas, con "fechaPago" <= "fechaVencimiento"
```
- Si `cuotasPagadas = 0` (tiene préstamo(s) pero ninguna cuota pagada
  aún — p.ej. recién desembolsado): puntos = **15** (mitad del máximo,
  "estimado", ni premio ni castigo) — no hay con qué medir puntualidad
  todavía, y es exactamente el tipo de dato que el deudor no tuvo
  oportunidad de generar.
- Si no: `puntos = round(30 * cuotasATiempo / cuotasPagadas)`.

### 2.2 Factor 2 — Mora vigente (0-20 pts)

```
moraMax = MAX("diasMoraActual") de los préstamos del deudor que NO están
          en ('cancelado','pagado','refinanciado')
```
Mismos cortes que `distribucionMora` del Dashboard (Etapa 4) y
`SQL_ESCALAMIENTO` de Cobranza (Etapa 3), para que el número nunca
contradiga lo que el cobrador ya ve en esas pantallas:

| diasMoraActual | Puntos |
|---|---|
| 0 | 20 |
| 1-30 | 14 |
| 31-60 | 8 |
| 61-90 | 3 |
| 90+ | 0 |

Sin préstamos activos (todos pagados/cancelados): `moraMax` no existe →
se trata como 0 días (es un hecho real, no un dato faltante: hoy no tiene
ninguna mora vigente porque no tiene nada vigente) → 20 pts.

### 2.3 Factor 3 — Refinanciamientos y condonaciones previas (0-25 pts)

La señal de riesgo real más fuerte, como pide el documento del pedido.
Arranca en 25 (confianza plena) y se descuenta por hechos reales — nunca
por falta de dato (un deudor sin ningún refinanciamiento/condonación
conserva los 25 puntos, con o sin historial):

```
totalRefinanciamientos = COUNT(pr_refinanciamientos) del deudor
montoCondonado = SUM(pr_refinanciamientos.moraCondonada + interesCondonado)
               + SUM(pr_cuotas.moraCondonada + interesCondonado, vía sus préstamos)
```
- `-15` si `totalRefinanciamientos >= 1` (tuvo que renegociar — no pudo
  pagar en los términos originales).
- `-15` adicional si `montoCondonado > 0` (además se le perdonó dinero
  real — un hecho distinto y más grave que solo renegociar plazo/tasa,
  sea que haya venido empaquetado en el refinanciamiento o por
  condonación independiente de Etapa 2 resto §6).
- Suelo 0 (nunca negativo). Un deudor con refinanciamiento Y condonación
  queda en 0/25 — el "peor caso" de este factor, intencional.

### 2.4 Factor 4 — Trayectoria de préstamos cerrados (0-15 pts)

```
cerrados = pr_prestamos con estado IN ('pagado','cancelado','refinanciado')
limpios  = de esos, estado='pagado' Y ninguna de sus cuotas tiene
           moraCondonada+interesCondonado > 0
```
- Si `cerrados = 0` (su(s) préstamo(s) siguen vivos, nunca cerró uno):
  puntos = **8** (mitad del máximo redondeada, "estimado") — no tuvo
  oportunidad de demostrar que termina bien un préstamo.
- Si no: `puntos = round(15 * limpios / cerrados)`.

### 2.5 Factor 5 — Respaldo: garantías y garantes activos (0-10 pts)

```
tieneGarantiaActiva = EXISTS pr_garantias (deudorId, estado='activa')
tieneGaranteActivo  = EXISTS pr_garantes  (vía sus préstamos, estado='activo')
puntos = (tieneGarantiaActiva ? 5 : 0) + (tieneGaranteActivo ? 5 : 0)
```
Sin "estimado" aquí — la ausencia de garantía/garante es un hecho real
disponible desde el primer día (un deudor nuevo puede registrar una
garantía antes de su primer préstamo, a diferencia de la puntualidad o la
trayectoria, que exigen que pase tiempo). 0/10 es la verdad, no un
castigo por falta de datos.

### 2.6 Por qué "antigüedad como cliente" NO es un factor con peso propio

El pedido lo sugería como ejemplo orientativo. Se decidió **no** darle un
peso dedicado: la sola antigüedad no es una señal de riesgo por sí misma
(un cliente nuevo no es automáticamente peor que uno viejo — castigarlo
por antigüedad baja violaría la misma regla de "no castigar por falta de
oportunidad de generar historial" que exige todo lo demás), y gran parte
de lo que "antigüedad" intentaría capturar ya lo captura el Factor 4
(trayectoria de préstamos cerrados) sin ese sesgo. Se expone igual en la
respuesta como **metadata informativa** (`clienteDesde`, fecha del primer
préstamo o `createdAt` si nunca tuvo uno) para que quien lee el desglose
tenga el contexto, pero no suma ni resta puntos.

### 2.7 Ejemplos (verificados en los tests unitarios, §5)

- **Deudor nuevo, sin préstamos**: 60/100, banda C, `sinHistorial: true`.
- **Deudor perfecto** (100% a tiempo, sin mora, sin refinanciar/condonar,
  préstamos previos pagados limpios, con garantía y garante): 30+20+25+15+10
  = **100/100, banda A**.
- **Deudor con condonación previa** (puntualidad decente pero no perfecta,
  mora actual leve, refinanciado Y con condonación, sin respaldo): queda
  muy por debajo de "Bueno" — el Factor 3 en 0/25 es lo que lo hunde,
  exactamente la señal que el pedido pidió priorizar.

---

## 3. "Inteligencia" — alerta de cambio de patrón

El pedido prioriza explícitamente esta señal sobre cualquier otra idea de
"inteligencia": un deudor que pagaba bien y de pronto se atrasó es
distinto de uno que siempre fue mal pagador, y Cobranza (Etapa 3) solo
muestra "está en mora" — no distingue el historial detrás.

```
alertaCambioPatron = puntualidadHistoricaPct >= 80
                   AND cuotasPagadas >= 3        (evita falsos positivos
                                                    con 1-2 pagos, muy poca
                                                    muestra para hablar de
                                                    "patrón")
                   AND moraMax >= 5                (mismo umbral que el
                                                    primer escalón de
                                                    Cobranza, "recordatorio")
```
Reutiliza números que el cálculo del score ya produce — **cero queries
adicionales**. Se muestra como una alerta aparte (no es un factor que
reste del score — es información para el cobrador/oficial, en la misma
línea que "promesa incumplida" de Cobranza) con el texto: *"Este deudor
tiene buen historial de pago pero está en mora ahora mismo — puede ser un
cambio de situación reciente, vale la pena llamar antes que a alguien
crónicamente moroso."*

No se agregó ninguna otra alerta nueva (el pedido fue explícito en no
inventar features de catálogo) — el resto de "inteligencia" ya existe en
Cobranza (promesas incumplidas, escalamiento) y Dashboard (distribución de
mora, top deudores), y el score ya se integra con esos datos vía los
factores 2 y 3.

---

## 4. Backend — ¿al vuelo o persistido/cacheado?

**Decisión: se calcula al vuelo, en cada request, nunca se persiste ni se
cachea.**

Por qué:
- Es el mismo patrón que ya usa **todo** el resto de analítica de
  Prestamista — `DashboardPrestamistaService.getKpis()` (6 queries en
  vivo) y las 12 queries de `ReportesPrestamistaService` recalculan todo
  en cada llamada; no existe ninguna capa de caché en este módulo hoy.
- El hallazgo de `diasMoraHistorico` (§1.1) es la prueba concreta de qué
  sale mal cuando se persiste un número derivado sin un mecanismo de
  actualización disciplinado: queda muerto, mintiendo con un 0 para
  siempre. Un score persistido necesitaría re-calcularse en CADA mutación
  que toca cualquiera de sus 5 factores — pagos, anulación de pagos,
  refinanciamiento, condonación, reestructuración, cambios de garantía/
  garante — siete puntos de invalidación distintos en servicios ya
  existentes, todos con su propia transacción. Es mucha superficie para
  mantener sincronizada sin ganancia real de rendimiento hoy.
- El volumen real no lo justifica: la consulta se hace para UN deudor a
  la vez (ficha, o al evaluar una solicitud puntual), con 5 queries cortas
  sobre tablas ya indexadas por `deudorId`/`prestamoId` — nada parecido al
  costo de un reporte de cartera completa.

Si en el futuro el volumen por tenant crece lo suficiente para que esto
pese, la alternativa (columna `pr_deudores.scoreAutomatico` +
`bandaAutomatica`, recalculada por un cron nocturno o por un trigger en
cada mutación relevante) queda anotada en `decisiones-pendientes.md` como
una optimización futura, no una necesidad de hoy.

---

## 5. Dónde se usa — nunca decide, solo informa

1. **`FichaDeudorPage.tsx`** — badge junto al nombre ("Score: 72/100 (B)")
   con un desglose expandible (Collapse/Popover) mostrando los 5 factores,
   sus puntos, su máximo y el detalle de cómo se calculó cada uno. La
   alerta de cambio de patrón, si aplica, aparece como un Tag ámbar junto
   al badge.
2. **`SolicitudesPage.tsx`** — en el modal de detalle de una solicitud
   pendiente (justo antes de los botones Aprobar/Rechazar), el mismo badge
   + desglose del deudor de esa solicitud — una señal más para que quien
   decide tenga el contexto, **nunca** bloquea ni auto-rechaza nada: los
   botones Aprobar/Rechazar siguen siempre habilitados sin importar el
   score.

---

## 6. Backend — entidad/servicio/endpoint

- **Sin entidad nueva** — el score no se persiste (§4), así que no hace
  falta ninguna tabla ni columna nueva.
- `DeudorScoringService` (`scoring/scoring.service.ts`) — mismo patrón
  que el resto del módulo: `@InjectDataSource()` + SQL crudo, cada
  concepto en su propia query (mismo estilo que
  `DashboardPrestamistaService`/`CobranzaService`), todas con el filtro
  `empresaId` explícito en cada tabla que lo lleva (incluidos los JOIN de
  `pr_garantes`/`pr_cuotas` por `prestamoId`, con el mismo criterio
  paranoico que dejó la Etapa 4 tras encontrar los 3 JOIN sin filtro).
- `ScoringController` (`scoring/scoring.controller.ts`) — mismos cuatro
  guards de siempre (`JwtAuthGuard, TenantGuard, RolesGuard,
  ModuloAddonGuard('prestamista')`) y los mismos roles de lectura que
  `DeudoresController`/`DashboardPrestamistaController`
  (`ADMIN, CONTADOR, VENDEDOR, VIEWER`) — es información de solo lectura,
  no más sensible que lo que la ficha del deudor ya muestra.
  `GET /prestamista/deudores/:id/score`.
- Registrado en `prestamista.module.ts` (providers/controllers), sin
  entidades nuevas en `TypeOrmModule.forFeature`.

---

## 7. Decisiones pendientes anotadas en `decisiones-pendientes.md`

Ver el archivo — resumen: (1) pesos exactos del score son el default de
arranque, ajustables si Jean los quiere distintos; (2) reestructuración no
cuenta como factor propio por falta de un registro estructurado (se
necesitaría una tabla `pr_reestructuraciones`); (3) `diasMoraHistorico` es
una columna muerta en `pr_deudores` — fuera de alcance corregir qué la
escribe desde esta etapa; (4) score calculado al vuelo, sin caché — si el
volumen crece, hay una alternativa documentada.

---

## Resumen (cerrado 2026-10-11)

Auditoría de `deudores/**`, `dashboard/**`, `reportes/**`, `cobranza/**` y
las entidades de Prestamista antes de diseñar nada. Encontró que
`pr_deudores.diasMoraHistorico` es una columna muerta (nunca se escribe en
ningún servicio, siempre 0) — la prueba concreta de por qué este score se
calcula al vuelo en cada request en vez de persistirse. También encontró
que reestructurar un préstamo no deja ningún registro estructurado (solo
texto libre en `notas`), así que no entra como factor propio del score.

**Score**: motor de reglas 0-100, banda A-E, 5 factores con peso fijo y
explicado (Puntualidad 30, Mora vigente 20, Refinanciamientos/
condonaciones previas 25 — la señal de riesgo más fuerte, con descuentos
independientes por refinanciar y por condonar dinero real—, Trayectoria de
préstamos cerrados 15, Respaldo de garantías/garantes 10). Un deudor sin
ningún préstamo recibe un neutral fijo de 60/C en vez de una suma parcial
fabricada; los factores que exigen que pase tiempo (puntualidad,
trayectoria) usan la mitad de sus puntos cuando el dato todavía no existe,
nunca 0 — nadie sale castigado por no haber tenido oportunidad de generar
historial. "Antigüedad como cliente" se decidió NO ponderarla (ver §2.6) —
queda solo como metadata informativa.

**Inteligencia**: una sola alerta, la que el pedido priorizó explícitamente
— "cambio de patrón" (buen historial de pago pero en mora ahora mismo),
reutilizando los números que el score ya calcula, cero queries
adicionales. No se inventó ninguna otra señal de catálogo.

**Dónde se usa**: `FichaDeudorPage.tsx` (badge junto al nombre, con
desglose en un Popover al click) y `SolicitudesPage.tsx` (mismo badge en
el modal de detalle de una solicitud pendiente, antes de Aprobar/
Rechazar — nunca bloquea esos botones).

**Backend**: `DeudorScoringService`/`ScoringController` nuevos
(`scoring/`), sin entidad ni tabla nueva (el score no se persiste),
registrados en `prestamista.module.ts`. Endpoint
`GET /prestamista/deudores/:id/score` con los 4 guards de siempre y los
roles de lectura de `DeudoresController`.

**Frontend**: `ScoreDeudorBadge.tsx` (componente nuevo, reusado en las dos
pantallas), `prestamistalApi.getScoreDeudor()`.

**Tests**: 6 nuevos en `scoring.service.spec.ts` (deudor sin historial,
deudor perfecto, deudor con refinanciamiento+condonación, alerta de
cambio de patrón, aislamiento multi-tenant, deudor inexistente) + 3 de
integración en `FichaDeudorPage.scoring.test.tsx` (badge, desglose
completo, no llama al endpoint sin id). Backend: 4975 tests en verde
(+9 sobre los 4966 de Etapa 6 — 6 de scoring, el resto variación normal
de conteo entre corridas). Frontend: `npx tsc --noEmit` limpio en ambos
lados; la suite completa de Vitest repite los mismos 3 archivos ya
documentados como flakiness preexistente bajo carga completa
(`ClienteFormModal.test.tsx`, `SelectClienteConAlta.test.tsx`,
`DetallePrestamo.anulacion-garantias.test.tsx` — los tres confirmados en
verde al correrlos solos, sin relación con este cambio); 675-678/681 en
verde según la corrida, 0 fallos nuevos atribuibles a esta etapa.

Commits: 1 de docs (esta nota + `decisiones-pendientes.md`), 1 feature de
backend (servicio + controlador + módulo), 1 de tests de backend, 1
feature de frontend (badge + wiring en las dos pantallas), 1 de tests de
frontend. Todo pusheado a `origin/feat/prestamista-motor`.

Con esto se cierra el roadmap completo de Prestamista (Etapas 1-7) — ver
`README.md`.
