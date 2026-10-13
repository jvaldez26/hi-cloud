# Prestamista Etapa 6 — Seguridad — nota de diseño

**Estado: CERRADO el 2026-10-11.** Ver "Resumen (cerrado 2026-10-11)" al
final del documento.

Auditoría de seguridad de `src/prestamista/**` (backend) y las pantallas
correspondientes de Prestamista en el frontend, con el mismo criterio que
las auditorías ya hechas en este proyecto para Super Admin y Agro:
exploración exhaustiva línea por línea, hallazgos concretos con severidad y
archivo:línea exacto — no una lista de buenas prácticas genéricas.

Se revisaron los 17 controllers de `src/prestamista/**` (pagos, garantes,
garantías, desembolsos-parciales, reestructuración, condonación, cobranza,
solicitudes, préstamos, deudores, vehículos, feriados, productos-préstamo,
simulaciones, pdf, reportes, dashboard, refinanciamiento) y sus servicios,
cruzando autorización (guards/roles), IDOR por empresaId, validación de
entrada, rastro de auditoría de las acciones de alto riesgo, logging
sensible y las pantallas de `DetallePrestamo.tsx`.

---

## 1. Hallazgos — con severidad

### 1.1 CRÍTICO — `/prestamista/refinanciamientos` condonaba deuda sin la autorización dual de `/condonar`

**Archivos:**
- `src/prestamista/refinanciamiento/refinanciamiento.controller.ts` (antes del fix: línea 29)
- `src/prestamista/refinanciamiento/refinanciamiento.service.ts:82-87, 160-168`
- `src/prestamista/dto/prestamista.dto.ts:286-291` (`RefinanciarDto.moraCondonada`/`interesCondonado`, solo `@Min(0)`, sin cota superior)

`CondonacionService.condonar()` (perdonar mora/interés pendiente de un
préstamo) está marcado explícitamente como "acción grave, perdona deuda" —
por eso el controller exige `@Roles(UserRole.ADMIN)` SOLO (ni CONTADOR) +
`@UseGuards(RequiereSupervisorSiempre('condonar_prestamo'))`, que ni el
propio ADMIN puede autorizarse a sí mismo. Además `condonarEnTransaccion()`
topa cada condonación con `Math.min()` contra lo realmente pendiente cuota
por cuota — nunca se puede condonar más de lo que existe.

`RefinanciamientoService.refinanciarEnTransaccion()` aplica
`data.moraCondonada`/`data.interesCondonado` — **el mismo efecto financiero
que condonar_prestamo** (líneas 82-87: se restan de los saldos para calcular
`montoNuevo`, y se registran en `pr_refinanciamientos` y en el asiento
contable) — pero el endpoint `POST /prestamista/refinanciamientos` solo
exigía `@Roles(ADMIN, CONTADOR)`, **sin ningún guard de supervisor**, y el
DTO solo validaba `@Min(0)` (sin tope superior).

**Impacto real:** cualquier usuario CONTADOR (rol que ni siquiera puede
llamar a `/condonar`) podía condonar mora/interés arbitrario de un préstamo
llamando a `/refinanciamientos` en vez de `/condonar`, sin segunda persona
y sin que el monto condonado estuviera acotado al saldo real — con
`moraCondonada`/`interesCondonado` mayores al saldo real, `montoNuevo`
(`saldoCapital + (saldoInteres-interesCondonado) + (saldoMora-moraCondonada)`)
podía quedar negativo o absurdo, y ese valor se pasa directo al cálculo de
la tabla de amortización del préstamo nuevo.

Este es exactamente el control de segregación de funciones que el propio
proyecto decidió necesario para condonaciones (ver `etapa-2-resto.md` §6) —
aplicado solo en una de las dos rutas que logran el mismo efecto.

**[CORREGIDO]**
1. `refinanciamiento.service.ts`: `moraCondonada`/`interesCondonado` ahora
   se topan (`Math.min`) contra `saldoMora`/`saldoInteres` reales del
   préstamo — igual que `CondonacionService.condonarEnTransaccion()`.
2. `requiere-supervisor-siempre.guard.ts`: se le agregó soporte opcional de
   `soloSi` (igual que ya tenía `RequiereSupervisor`, pero sin el bypass
   por rol — aquí nadie se autoriza a sí mismo nunca).
3. `refinanciamiento.controller.ts`: `refinanciar()` ahora lleva
   `@UseGuards(RequiereSupervisorSiempre('condonar_prestamo', { soloSi: condonaAlRefinanciar }))`,
   donde `condonaAlRefinanciar(body)` es `moraCondonada > 0 || interesCondonado > 0`.
   Un refinanciamiento SIN condonación no cambia de comportamiento — solo
   se exige la autorización dual cuando el body efectivamente perdona
   mora/interés, igual severidad que `/condonar`.

**Tests adversariales nuevos:**
- `src/prestamista/prestamos/desembolso-transaccional.spec.ts` — "nunca
  condona más mora/interés del que el préstamo tiene pendiente" (pide
  999999 de mora/interés contra saldos reales de 30/500, verifica que el
  asiento recibe 30/500, no 999999).
- `src/supervisor-politicas/guards/requiere-supervisor-siempre.guard.spec.ts`
  (nuevo archivo, no existía) — cubre el guard en general (ADMIN no se
  autoriza a sí mismo, token de otra persona, clave desmarcada) y el caso
  real: refinanciar sin condonación pasa sin pedir nada; refinanciar CON
  `moraCondonada`/`interesCondonado` sin autorización → 403.

### 1.2 ALTO — `PrestamosService.cancelar()` permitía "cancelar" un préstamo con dinero ya movido, sin reversar nada

**Archivo:** `src/prestamista/prestamos/prestamos.service.ts` (método `cancelar`)

Solo verificaba `estado === 'cancelado'`. Permitía cancelar un préstamo en
`desembolso_parcial` (dinero YA entregado) o con `totalPagado > 0` (pagos
YA cobrados) — sin reversar ningún asiento del desembolso original (a
diferencia de `anular()`/`condonar()`/`reestructurar()`, que sí tocan la
contabilidad dentro de su propia transacción), sin exigir la autorización
que esas otras acciones sí exigen, y restando `prestamosActivos` al deudor
como si la deuda jamás hubiera existido. Mismo efecto que condonar el 100%
de la deuda, sin ninguna de sus salvaguardas.

**[CORREGIDO]** Se agregaron las mismas dos guardas de estado que ya usan
`condonar()`/`reestructurar()` para el mismo escenario:
- Bloquea si `estado === 'desembolso_parcial'`.
- Bloquea si `totalPagado > 0` (remite a anular los pagos primero, o a usar
  condonación/reestructuración).

Con esto, `cancelar()` queda restringido a préstamos sin ningún movimiento
de dinero real — el caso legítimo (error de captura antes de desembolsar).
No se agregó `RequiereSupervisorSiempre` nueva: con las dos guardas de
estado, ya no puede "cancelar" dinero real, así que una autorización dual
es una decisión de negocio aparte, no una corrección de un hueco — ver
`decisiones-pendientes.md`.

**Tests adversariales nuevos:** `src/prestamista/prestamos/prestamos-cancelar.spec.ts`
(nuevo archivo, no existía ningún test de `cancelar()`) — cubre el caso
feliz, inexistente, ya cancelado, y los dos casos reales del hueco
(`desembolso_parcial` y `totalPagado > 0`, ambos deben rechazarse).

### 1.3 MEDIO — `SolicitudesService.decidir()` tenía una ventana de carrera (TOCTOU)

**Archivo:** `src/prestamista/solicitudes/solicitudes.service.ts` (método `decidir`)

`orFail()` lee el estado con un SELECT simple (sin `FOR UPDATE`), valida en
memoria que esté en `pendiente`/`en_revision`, y el `UPDATE` final no
repetía esa condición de estado. Dos llamadas concurrentes a `/decidir`
sobre la misma solicitud (doble clic, o dos aprobadores a la vez) podían
leer ambas "pendiente" antes de que cualquiera escribiera, y ambas ejecutar
el `UPDATE` — la segunda sobrescribía en silencio el `estado`/`montoAprobado`/
`tasaAprobada`/`decididoPor`/`motivoRechazo` de la primera, sin ningún error.
`PrestamosService.crearEnTransaccion()` sí bloquea la solicitud con
`FOR UPDATE` antes de desembolsar, precisamente para evitar esta clase de
carrera — el mismo cuidado no se había aplicado aquí.

**[CORREGIDO]** Se repite la condición de estado dentro del propio `UPDATE`
(`WHERE id=$6 AND "empresaId"=$7 AND estado IN ('pendiente','en_revision')`),
volviéndolo atómico a nivel de fila: si la solicitud ya cambió de estado
entre el SELECT y el UPDATE, `RETURNING *` viene vacío y se rechaza
explícitamente (`BadRequestException`) en vez de devolver `undefined` como
si hubiera ido bien.

**Tests adversariales nuevos:** `src/prestamista/solicitudes/solicitudes-decidir.spec.ts`
(nuevo archivo — `SolicitudesService` no tenía ningún spec propio). Cubre
el caso feliz, inexistente, ya decidida, segregación de funciones
(creador ≠ aprobador) y el caso de la carrera: la solicitud "pendiente" al
leer pero ya decidida por otra request al momento del UPDATE.

### 1.4 MEDIO — la descripción de auditoría de condonar/reestructurar en Prestamista era incorrecta o vacía

**Archivo:** `src/auditoria/interceptors/audit.interceptor.ts` (`generarDescripcion`)

El interceptor global (`AuditInterceptor`, registrado como `APP_INTERCEPTOR`
en `app.module.ts`) **sí audita toda escritura** con quién (`userId`/
`userName` del JWT), cuándo (`createdAt`), qué ruta/préstamo (`entidadId`,
vía `extraerEntidadId()`, que toma el primer segmento numérico — funciona
bien aunque `/condonar`/`/reestructurar` no terminen en el id) y el cuerpo
completo de la respuesta (`valorNuevo`, truncado a 2000 caracteres) — así
que esto **no es una ausencia de rastro** (los montos condonados SÍ quedan
en `valorNuevo`, consultables desde el panel de Auditoría).

El problema real es que la rama `r.includes('/condonar')` de
`generarDescripcion()` estaba escrita para `educativo/colegiatura` (lee
`body.condonacion.montoCondonado`/`cargo.id`, el shape de
`ColegiaturaService.condonarMora()`), y `/prestamista/prestamos/:id/condonar`
coincide con el mismo substring — así que el log de Prestamista salía como
"X condonó mora" sin monto, sin motivo y sin decir de qué préstamo.
`/reestructurar` no colisionaba con nada, pero caía al fallback genérico
("X actualizó en prestamista #id") sin ningún detalle.

**[CORREGIDO]** Se agregaron dos ramas específicas para
`/prestamista/prestamos/.../condonar` y `/reestructurar`, colocadas ANTES
de la rama de educativo, usando la forma real de la respuesta de
`CondonacionService`/`ReestructuracionService` (monto de mora/interés
condonado; cuotas reemplazadas/nuevas).

**Tests nuevos:** `src/auditoria/interceptors/audit.interceptor.spec.ts` —
casos para condonar con mora+interés, solo mora, que NUNCA cae en la rama
de educativo, reestructurar con el detalle de cuotas, y que la rama de
educativo (`/condonar-mora`) sigue funcionando igual (no regresión).

### 1.5 CRÍTICO (CI, no de este módulo en particular pero descubierto durante esta etapa) — `query()` sobre `UPDATE ... RETURNING *` devolvía el array entero, no la fila

**Archivos:** `src/prestamista/pagos/pagos.service.ts:590` (anulación) y
`src/prestamista/reestructuracion/reestructuracion.service.ts:116` (reestructurar)

Ver `feedback_typeorm_query_returning.md` (memoria del proyecto) — el bug
de clase ya conocido: `query()` de TypeORM+PostgresQueryRunner devuelve
`[filas, rowCount]` para UPDATE/DELETE, nunca la fila sola.
`const [pagoAnulado] = await qr.query('UPDATE ... RETURNING *')` dejaba
`pagoAnulado` como el array `[fila]` entero (`.id`/`.estado` undefined), no
la fila. Atrapado por el gate de CI "CAPA 5" (`scripts/validate-update-returning.js`)
ANTES de llegar a producción — GitHub Actions marcó el job en rojo en
`feat/prestamista-motor` apenas se pusheó Etapa 2/5 sin que la suite local
(jest/tsc) lo hubiera señalado (ese script no corre dentro de jest).

**[CORREGIDO]** Ambos sitios envueltos en CTE (`WITH fila AS (UPDATE ...
RETURNING *) SELECT * FROM fila`), igual que el resto del módulo
(`garantias.service.ts`, `solicitudes.service.ts`). Verificado con
`node scripts/validate-update-returning.js` (0 hallazgos nuevos) y
búsqueda manual de los 121 `.query()` de `src/prestamista/**` contra UPDATE/DELETE.

**Tests adversariales nuevos:** se agregó a `pagos-anulacion.spec.ts` y a
`reestructuracion.service.spec.ts` una prueba que verifica la FORMA del SQL
enviado (empieza con `WITH`, termina en `SELECT * FROM fila`) — los mocks
existentes de ambos specs devuelven filas directamente sin importar la
forma real del SQL, así que no habrían atrapado una regresión por sí solos;
estas pruebas sí, igual que el verificador de CI.

**Lección hacia adelante (anotada en `feedback_deploy_verify.md`/memoria,
no en este documento):** después de cada push a esta rama hay que confirmar
con `gh run list --branch feat/prestamista-motor` que el CI remoto también
pasa, no solo la suite local — los checks de CAPA 3/5/6 (migraciones,
UPDATE/RETURNING, empresaId en SQL crudo) no corren dentro de jest.

---

## 2. Verificado correcto — sin hallazgos

### 2.1 Autorización — guards por endpoint

Los 17 controllers llevan `JwtAuthGuard, TenantGuard, RolesGuard,
ModuloAddonGuard('prestamista')` a nivel de clase, y cada endpoint mutante
tiene un `@Roles()` acorde a la sensibilidad real de la acción (verificado
leyendo el guard, no asumido por el nombre):

- `RolesGuard` resuelve el rol **por empresa** (`usuario_empresa`), no
  `users.role` global — correcto, ya corregido en una auditoría anterior.
- Las 4 acciones con `RequiereSupervisorSiempre` (`anular_pago_prestamo`,
  `ejecutar_garantia`, `reestructurar_prestamo`, `condonar_prestamo`) se
  confirmó que el guard bloquea de verdad sin el token de otra persona (sin
  bypass de rol — ni ADMIN se autoriza a sí mismo), y que **antes de este
  fix** solo `refinanciar()` lograba el mismo efecto sin el guard (§1.1,
  ya corregido).
- Desembolsar, cancelar, decidir solicitud, refinanciar y asignar cobrador
  exigen correctamente ADMIN/CONTADOR (nunca VENDEDOR); crear
  solicitud/deudor/vehículo/garantía permite VENDEDOR (operación básica).
- Liberar garantía/garante (caso normal, no mueve dinero) exige
  ADMIN/CONTADOR sin autorización dual — decisión de diseño ya documentada
  en `etapa-2-resto.md` §2-3, consistente con el código real.

### 2.2 IDOR / cruce entre tenants

Revisados `findOne`/`update`/toda acción por `:id` de los 17 módulos: el
SERVICIO (no solo el controller) filtra siempre por `empresaId`, tanto en
el SELECT de verificación como en el UPDATE final
(`WHERE id=$n AND "empresaId"=$m`). Los JOIN a `pr_deudores`/`pr_prestamos`
repiten `AND tabla."empresaId"=otra."empresaId"` en cada uno — el patrón de
JOIN sin filtro de empresa que se encontró y cerró en la Etapa 4
(`reportes.service.ts`) no se repite en ningún endpoint de un solo recurso.
`solicitudes.service.ts`/`garantias.service.ts` validan explícitamente que
`deudorId`/`prestamoId`/`solicitudId` del body pertenezcan a la empresa
actual antes de usarlos (`assertDeudorDeEmpresa`/`assertPrestamoDeEmpresa`).

Confirmado también con el gate de CI "CAPA 6"
(`node scripts/check-tenant-empresaid-filter.js`): 0 hallazgos nuevos en
`src/prestamista/**`.

**Cartera asignada (cobranza):** existe el concepto (`cobradorId` en
`pr_prestamos`, Etapa 3), pero no es una restricción de ACCESO — cualquier
VENDEDOR+ puede ver la cartera completa de la empresa, con o sin filtro de
cobrador. Es consistente con el resto del módulo (ningún listado de
Prestamista restringe por "mi cartera" a nivel de autorización), así que no
se reporta como hallazgo — es el comportamiento esperado del diseño actual,
anotado aquí por si el negocio decide en el futuro que un vendedor/cobrador
no debería ver préstamos de otro cobrador.

### 2.3 Validación de entrada

`ValidationPipe` global confirmado en `main.ts` con
`whitelist: true, forbidNonWhitelisted: true`. `prestamista.dto.ts` tiene
cobertura sólida de `class-validator` en los 17 módulos (montos
`@IsNumber(MONTO) @IsPositive`/`@Min(0)` según si pueden ser cero, enteros
`@IsInt() @IsPositive`, fechas `@IsDateString`). El único vacío de
validación cruzada real era `moraCondonada`/`interesCondonado` de
`RefinanciarDto` sin tope contra el saldo real — ya corregido en §1.1.

### 2.4 Rastro de auditoría en acciones de alto riesgo

- `anular_pago_prestamo`: columnas dedicadas `anuladoPor`/`anuladoPorNombre`/
  `anuladoEn`/`motivoAnulacion` en `pr_pagos`.
- `ejecutar_garantia`/liberar garantía: `cambiadoPor`/`cambiadoPorNombre`/
  `motivoCambioEstado`/`fechaEjecucion` en `pr_garantias`.
- `liberar` garante: `liberadoPor`/`liberadoPorNombre`/`liberadoEn`/
  `motivoLiberacion` en `pr_garante`.
- `condonar_prestamo`/`reestructurar_prestamo`: solo concatenan el motivo en
  `notas` (texto libre, sin usuario ni columna dedicada) — pero el rastro de
  QUIÉN y CUÁNDO sí queda, de forma genérica y consultable, en el
  `AuditLog` global (§1.4 corrige solo la descripción legible, no agrega
  columnas nuevas a `pr_prestamos`: el dato ya estaba, solo se mostraba mal).

**`enListaNegra`/`motivoListaNegra` de un deudor (PATCH genérico de
`deudores.controller.ts`, ADMIN/CONTADOR):** no tiene columnas propias de
auditoría (quién/cuándo marcó a un deudor en lista negra) — viaja
indistinguible de cambiar un teléfono dentro del PATCH genérico
(`allowed` en `deudores.service.ts`). Igual que condonar/reestructurar,
SÍ queda capturado de forma genérica en el `AuditLog` (usuario, timestamp,
`valorNuevo` con el nuevo valor del campo), solo que sin una descripción
legible propia. No se le agregó una rama específica en
`generarDescripcion()` en esta etapa porque el PATCH genérico de CASI
cualquier entidad del ERP tiene el mismo nivel de detalle (es el patrón
general del sistema, no algo específico de Prestamista) — tratarlo aparte
aquí habría sido una mejora de catálogo, no la corrección de un hueco
nuevo encontrado en este módulo.

**Frontend — ya corregido en esta etapa:** `DetallePrestamo.tsx` nunca
mostraba quién/cuándo/motivo de anular un pago, ejecutar/liberar una
garantía o liberar un garante — solo la etiqueta de estado, aunque el
backend sí los graba en columnas dedicadas (ver arriba). Se agregó un
`Tooltip` sobre el `Tag` de estado en las tres tablas (Pagos, Garantías,
Garantes) que muestra "Por: ... · Fecha: ... · Motivo: ..." cuando el
estado es `anulado`/`liberada`/`ejecutada`/`liberado` y el dato existe —
sin agregar columnas nuevas a tablas que ya van apretadas de ancho. Tests
nuevos en `DetallePrestamo.anulacion-garantias.test.tsx` (hover sobre el
Tag, verificar que aparece el nombre y el motivo).

### 2.5 Secretos y datos sensibles en logs

Revisados todos los `Logger.log`/`.warn`/`.error`/`console.*` de
`src/prestamista/**`: ninguno expone contraseñas, tokens o cédula completa
en texto plano — solo nombres de usuario, números de préstamo/garantía y
montos (logging operativo normal). `cobranza.service.ts` loguea el email
del deudor (PII leve, no una credencial) al enviar un recordatorio —
aceptable para un log operativo, no se reporta como hallazgo.

### 2.6 Rate limiting / fuerza bruta en acciones sensibles

No existe (ni se agregó) un límite de intentos específico para
`ejecutar_garantia`/`anular_pago_prestamo` más allá del mecanismo de
supervisor. Se evaluó explícitamente si hacía falta uno: el mecanismo de
supervisor (token de un solo uso emitido por `POST /auth/verificar-supervisor`,
que a su vez pasa por `LoginAttemptsService`/bloqueo de cuenta) ya exige
las credenciales de OTRA persona para cada intento — un atacante con
cuenta propia no puede "probar muchas veces" sin que cada intento requiera
convencer a un segundo humano. No se construyó un limitador nuevo porque no
se encontró un camino real de fuerza bruta que el mecanismo existente no
cierre ya.

### 2.7 PDFs y reportes

`prestamista-pdf.service.ts` valida `empresaId` antes de generar cualquier
PDF (amortización, recibo, estado de cuenta, cotización, contrato, pagaré)
— 404 si el recurso no pertenece al tenant actual. `reportes.service.ts`/
`dashboard.service.ts` no expone el mismo dato/acción que las 4 acciones
críticas sin el guard de supervisor (confirmado: `recalcular` solo
recalcula agregados de saldo desde las cuotas existentes, lectura derivada,
no perdona deuda ni duplica el efecto de condonar/ejecutar/anular).

### 2.8 Endpoints "internos"/debug

No existe ningún endpoint `/interno`, `/debug`, `/sync` o `/test` en ningún
controller de `src/prestamista/**`.

---

## 3. Hallazgos de catálogo descartados (no son bugs reales)

Severidad **baja**, informativos, no corregidos (no son huecos de
seguridad, son inconsistencias cosméticas):

- `simulaciones.controller.ts` pone `@Roles(ADMIN, CONTADOR, VENDEDOR)` a
  nivel de CLASE — ni siquiera el GET de solo lectura está disponible para
  VIEWER, rompiendo el patrón del resto del módulo (que sí incluye VIEWER
  en lectura). Es MÁS restrictivo, no una brecha.
- `productos-prestamo.controller.ts` (`POST vista-tasa`, cálculo puro sin
  persistencia) exige ADMIN/CONTADOR, mientras que el endpoint análogo
  `simular` de `prestamos.controller.ts` sí permite VENDEDOR/VIEWER.
  Cosmético.
- `oficialId` en `CrearSolicitudDto`/`CrearPrestamoDto` no se valida contra
  `usuario_empresa` (a diferencia de `cobradorId` en `asignarCobrador`),
  pero no genera IDOR real: solo se usa como etiqueta
  (`oficialNombre` lo provee el cliente directamente), nunca para
  autorización ni para traer datos de otra tabla.

No se "inventó" ningún hallazgo de catálogo genérico (2FA en todo, WAF,
etc.) — todo lo de arriba viene de leer el código real.

---

## Resumen (cerrado 2026-10-11)

- **1 hallazgo CRÍTICO** (refinanciamiento bypasseaba la autorización dual
  de condonación) — corregido con tope de montos + guard condicional +
  tests adversariales.
- **1 hallazgo ALTO** (`cancelar()` sin guarda de estado) — corregido con
  dos guardas nuevas + tests adversariales.
- **2 hallazgos MEDIO** (carrera en `decidir()`; descripción de auditoría
  incorrecta para condonar/reestructurar en Prestamista) — ambos
  corregidos con tests adversariales.
- **1 bug de CI (CAPA 5, patrón ya conocido)** encontrado por GitHub
  Actions a mitad de esta etapa, no por la suite local — 2 sitios
  corregidos (`pagos.service.ts`, `reestructuracion.service.ts`) + tests
  que verifican la forma del SQL, no solo el resultado mockeado.
- **Frontend**: `DetallePrestamo.tsx` ahora muestra quién/cuándo/motivo de
  anular un pago, ejecutar/liberar una garantía y liberar un garante
  (tooltip sobre el Tag de estado) — el dato ya existía en el backend,
  solo no se mostraba.
- Autorización, IDOR/empresaId, validación de entrada (DTOs +
  ValidationPipe global), logs sensibles, rate limiting en acciones
  sensibles, PDFs cross-tenant y endpoints "internos": **sin hallazgos**
  más allá de lo corregido arriba — confirmado explícitamente para cada
  punto del checklist de esta etapa, no asumido.
- 3 hallazgos de catálogo (bajo, cosméticos) descartados — anotados en §3
  sin corregir, no son huecos de seguridad.
- No se encontró ningún hallazgo que requiriera una decisión de negocio
  nueva para esta etapa — ver `decisiones-pendientes.md`, sección "Etapa 6
  — Seguridad", para la única nota informativa (si `cancelar()` debería
  además exigir autorización dual, ahora que ya no puede tocar dinero
  real).
- Backend y frontend con tests nuevos (adversariales donde aplica) y suite
  completa en verde en ambos lados, pusheado a
  `origin/feat/prestamista-motor`.

**No se empezó la Etapa 7 (Scoring e inteligencia).**
