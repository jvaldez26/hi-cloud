# Módulo Educativo

**Estado: construido, sin clientes.** El módulo está registrado (`app.module.ts`,
guard de add-on, rutas de frontend, sidebar) y sus endpoints ya no revientan
contra Postgres — pero **0 empresas lo tienen contratado** y **0 filas** existen
en ninguna de sus 31 tablas. No hay urgencia por completarlo; tampoco hace
falta "retomar el desarrollo" para dejarlo seguro. Este documento existe para
que la próxima persona que lo abra no tenga que rehacer el inventario forense
de septiembre 2026.

## Qué funciona (14 submódulos, controller + service + rutas + guard)

| Submódulo | Archivo | Notas |
|---|---|---|
| Configuración académica | `config/` | Escalas de nota, letras, periodos, moneda de colegiatura. **No** es branding institucional (nombre/logo/colores) — ver "Decisiones de diseño" abajo. UI en Estructura Académica → Configuración. |
| Estructura académica | `estructura/` | Niveles, grados, secciones, asignaturas, pensum (UI en la pestaña Pensum). |
| Dashboard | `dashboard/` | Solo lectura. |
| Estudiantes | `estudiantes/` | CRUD + tutores (relación N:N vía `ed_estudiante_tutores`). |
| Tutores | `tutores/` | CRUD. |
| Docentes | `docentes/` | CRUD + asignaciones (`ed_asignaciones_docente`). |
| Matrículas | `matriculas/` | CRUD + stats. Sin ningún campo de beca propio (`becaId`/`descuentoBeca` se eliminaron — eran informativos, sin consumidor real; ver Becas). |
| Académico | `academico/` | Evaluaciones, calificaciones (bulk), asistencia (bulk + stats). Bloquea escritura si el período está cerrado (`common/periodo.util.ts`). |
| Colegiatura | `colegiatura/` | Planes de pago **por estudiante** (no por grado — ver abajo), cargos, pagos, resumen financiero. |
| Becas | `becas/` | Catálogo (`ed_becas`) + asignación a estudiantes (`ed_estudiante_becas`) — conectado a `generarCargos()`/`generarMatricula()`, ver "Becas" abajo. UI en `/educativo/becas`. |
| Boletines | `boletines/` | Consolidación de notas por período + PDF individual/masivo. Ver "Boletines" abajo. |
| Disciplina | `disciplina/` | Incidentes con tipo/categoría/medida/seguimiento, notificación a padres con fecha. Un docente (vinculado por `ed_docentes.usuarioId`) solo ve/reporta incidentes de sus propias secciones (`ed_asignaciones_docente`) — admin y el resto ven todo. Nunca loguea el contenido del incidente. |
| Biblioteca | `biblioteca/` | Libros + préstamos (a estudiante o a docente). `cantidadDisponible` con lock pesimista al prestar/devolver — nunca queda negativa. Estado `vencido` se deriva de `fechaVencimiento`, nunca se escribe. |
| Transporte | `transporte/` | Rutas (chofer, vehículo, capacidad, paradas) + asignación de estudiantes con control de capacidad (lock pesimista). Al asignar, genera cargos de transporte por el mismo motor que colegiatura (`ed_cargos`, tipo='transporte') — ver "Transporte" abajo. Becas no aplican (`ed_becas.aplicaA` no contempla 'transporte'). |
| Comunicados | `comunicados/` | CRUD, destinatario todos/grado/sección/individual (`ed_comunicados.estudianteId`, migración `1763600000000`). `enviarWhatsapp`/`enviarEmail` se guardan pero no disparan nada — el envío real queda para cuando exista una integración real (ver "Comunicados" abajo). |

Todos los controllers llevan `JwtAuthGuard, RolesGuard, TenantGuard,
ModuloAddonGuard('educativo')` — el guard estándar de add-on contratado
(consulta `empresa_modulos`, no `modulos_addon`), igual que taller/clínica/
farmacia/restaurante/etc. Todos los endpoints de escritura tienen DTO con
`class-validator` (antes eran `@Body() dto: any`, sin validación real pese al
`ValidationPipe` global).

## Qué no existe en absoluto (2 rutas, solo placeholder de frontend)

Comedor y enfermería: sin entidad, sin migración, sin nada — solo una ruta de
frontend con `EducativoPlaceholder`. Antes decía "— próximamente" en gris
chico (se veía igual que una lista vacía); ahora dice explícito "Módulo no
disponible" con `Result status="info"`.

**Ninguno de estos 2 (comedor, enfermería) se construye en esta tarea** — eso
espera a que haya un colegio interesado. Los otros 4 que compartían esta
sección (disciplina, biblioteca, transporte, comunicados) se construyeron en
la tanda 2 de septiembre 2026 — ver la tabla de arriba.

## Tanda 2 (septiembre 2026): disciplina, biblioteca, transporte, comunicados

- **Disciplina** — sin precedente de "rol docente" en el sistema (`UserRole`
  no tiene ese valor). El control de acceso usa `ed_docentes.usuarioId`
  (columna que existía, sin consumidor): si el usuario autenticado está
  vinculado como docente, se restringe a `ed_asignaciones_docente`; si no
  (admin, dirección, contabilidad), ve todo. Nunca se loguea
  descripcion/medidaTomada/seguimiento — solo ids opacos.
- **Biblioteca** — `prestar()`/`devolver()` corren en transacción con
  `SELECT ... FOR UPDATE` sobre el libro (mismo mecanismo que
  `caja.service.ts`, expresado en SQL crudo como el resto del módulo). El
  estado `vencido` de un préstamo se deriva en cada lectura comparando
  `fechaVencimiento` contra `fechaHoyRD()` — la columna `estado` solo
  guarda `'prestado'`/`'devuelto'`.
- **Transporte** — los cargos van por el mismo motor que colegiatura
  (`ed_cargos`, `tipo='transporte'`), nunca un segundo camino de deuda. Sin
  columna para enlazar cargo↔asignación, se usa `concepto` (mismo campo que
  colegiatura ya usa para su propio desglose). Las becas no aplican
  (`ed_becas.aplicaA` no contempla `'transporte'`). Baja a mitad de año: se
  anulan los cargos futuros sin pagar, nunca uno ya vencido o con algo
  abonado. **Bug real atrapado por la verificación con Playwright** (no por
  curl ni tests unitarios con mocks): `DataSource.query()` devuelve las
  columnas `date` como objetos `Date` de JS, no strings — el cálculo de
  meses en JS con `.split('-')` reventaba en silencio. Se resolvió
  calculando los meses en SQL con `generate_series`.
- **Comunicados** — CRUD simple, destinatario todos/grado/sección/
  individual. `ed_comunicados` no tenía columna para destinatario
  individual: se agregó `estudianteId` en la migración
  `1763600000000-AddEstudianteIdAEdComunicados.ts`. `enviarWhatsapp`/
  `enviarEmail` se guardan pero **no disparan nada** — infraestructura real
  ya existe (`EmailService`, `WhatsAppService` en `notificaciones/`, hoy en
  modo simulado sin credenciales) para cuando se implemente el envío.

Los 4 tienen su primera verificación e2e con Playwright del repo —
`hi-cloud frontend-project/e2e/` no existía antes de esta tanda.

## Boletines

Único de los 8 pendientes construido: no hay tabla nueva, se genera al vuelo
desde `ed_notas_periodo` + `ed_calificaciones` + `ed_asistencia` +
`ed_config`. Ver `boletines/boletines.service.ts` (consolidación de notas —
promedio ponderado proyectado sobre la escala configurable de `ed_config`,
nunca fija en código) y `boletines/boletin-pdf.service.ts` (PDFKit). Las
asignaturas del boletín salen del pensum del grado (`ed_grado_asignaturas`,
pantalla en Estructura Académica → Pensum) — sin pensum configurado, el
boletín no tiene qué mostrar. Un período cerrado (`ed_periodos.estado`)
congela evaluaciones, calificaciones y la consolidación —
`common/periodo.util.ts`, compartido con `academico.service.ts`.

## Decisiones de diseño (tabla vs. código — tomadas en esta tarea)

- **`ed_config`**: el código original asumía branding institucional
  (`nombreInstitucion`, `director`, `logoUrl`, colores) que nunca existió en
  la tabla. Se decidió que la TABLA es el diseño correcto (configuración
  académica: escalas, letras, periodos, moneda) porque es lo que ya consumen
  `academico.service.ts` y `colegiatura.service.ts` — se reescribió
  `upsertConfig()`, sin migración.
- **`ed_planes_pago` / colegiatura**: al revisar el módulo se encontró que
  parecía tener un diseño "por grado" (cuotas, mora, seguro) incompatible con
  el código y con el frontend, que asumen "un plan por estudiante". Antes de
  tocar nada se confirmó que existe una segunda migración
  (`1753700000000-FixColegiaturaSchema.ts`, aplicada manualmente en prod) que
  ya agregó las columnas del diseño "por estudiante" — el código está bien.
  El único bug real: `upsertPlan()` no insertaba `nombre` (`NOT NULL` sin
  default) — cada creación de plan revienta con 23502. Corregido generando un
  nombre por defecto cuando el caller no manda uno (el frontend no lo pide).
  Las columnas del diseño "por grado" (`gradoId`, `montoColegiaturaMensual`,
  `cantidadCuotas`, `montoMaterial`, `montoSeguro`, `diaVencimiento`,
  `cargoMoraPct`, `diasGracia`) siguen en la tabla y en la entidad, sin uso —
  no se migran fuera por ahora; si alguien construye facturación por cohorte
  de grado en el futuro, ya están ahí.

## Becas

`ed_becas` (catálogo, con `aplicaA`: colegiatura/inscripcion/ambos) y
`ed_estudiante_becas` (asignación a estudiantes, N:N — un estudiante puede
tener varias becas activas a la vez) existían desde la migración original
pero nunca se consultaban. `becas/becas.service.ts` los conecta:

- `becasAplicables(empresaId, estudianteId, anioEscolarId, aplicaA)` — becas
  activas del estudiante (y de la beca en el catálogo) que aplican a
  `'colegiatura'` o `'inscripcion'` (una beca con `aplicaA='ambos'` cuenta
  para las dos). Una asignación con `anioEscolarId` null no está atada a un
  año puntual y siempre cuenta.
- `colegiatura.service.ts` (`calcularDescuento()`, privado) combina
  `plan.descuento` (comercial, % suelto en el plan — ver más abajo) con las
  becas aplicables: **cada fuente se calcula sobre el monto ORIGINAL, nunca
  en cascada** — 10% de plan + 20% de beca es 30% del original, no 10% y
  después 20% sobre el resto (con cascada el resultado depende del orden y
  nadie puede auditarlo). El total se topa al monto del cargo — nunca
  negativo, nunca mayor al original.
- `generarCargos()` solo consulta becas `aplicaA IN ('colegiatura','ambos')`;
  `generarMatricula()` solo `aplicaA IN ('inscripcion','ambos')`.
  `plan.descuento` sigue aplicando solo a la colegiatura, como siempre
  (`generarMatricula()` nunca lo extendió y eso no cambió).

**`plan.descuento` vs. el catálogo de becas — decisión tomada:** son cosas de
naturaleza distinta, no lo mismo duplicado dos veces. `plan.descuento` es un
% comercial de UN plan, sin categoría ni rastro de aprobación, con frontend
real (`PlanModal`/`TabPlanes` en `ColegiaturaPage.tsx`). El catálogo de becas
es formal, categorizado (`aplicaA`), con `motivo`/`aprobadoPor` para
auditoría. Se decidió sumarlos (ver arriba) en vez de migrar todo a una sola
vía — evita tocar el frontend existente y no hay nada en el código que
obligue a unificarlos.

**Trazabilidad sin tablas nuevas:** `ed_cargos.concepto` (`VARCHAR(200)`, sin
ningún consumidor en el código ni en el frontend) guarda de dónde vino el
descuento: `plan:<monto>;beca:<becaId>:<monto>;...;topado`. El nombre de la
beca no se guarda ahí — se resuelve con un `JOIN` a `ed_becas` por `becaId`
al mostrarlo, así nunca queda desincronizado si la beca se renombra.
`topado` solo aparece si la suma bruta superó el monto del cargo. Si no hubo
ningún descuento, `concepto` queda `null`. `updateCargo()` no recalcula esta
traza si se edita `montoOriginal`/`descuento` a mano — el `concepto` de
creación queda como referencia histórica de por qué se generó ese descuento
originalmente, no se sincroniza con ediciones manuales posteriores.

**Hallazgo adicional durante la verificación:** `ed_pagos."montoPagado"` es
`NOT NULL` desde la migración base y tampoco se llenaba — mismo patrón
exacto que `montoOriginal` en `ed_cargos` (`FixColegiaturaSchema` agregó
`monto` al lado sin llenar la original). `registrarPago()` nunca se había
ejecutado hasta la verificación de la Fase 1. Desbloqueo mínimo aplicado
(mismo valor en ambas columnas); el diseño completo de `ed_pagos` sigue sin
reconciliar — no estaba en el alcance de ese bloque.

**Sin frontend todavía.** No hay pantalla para crear becas ni para
asignarlas a un estudiante — solo la API. Un admin las gestiona vía API
directa hasta que exista esa UI.

## Limitaciones conocidas, no corregidas en esta tarea

- **`bulkAsistencia()` no es idempotente.** El UNIQUE real de `ed_asistencia`
  es `("estudianteId", fecha, "asignaturaId")`, pero este endpoint es por
  sección/día y no recibe `asignaturaId` (queda `NULL` en cada fila).
  Postgres nunca considera dos `NULL` iguales para un UNIQUE, así que el
  `ON CONFLICT` ya no revienta (antes apuntaba a una constraint que no
  existía) pero tampoco actualiza — reenviar la misma asistencia inserta
  filas duplicadas. Documentado en el propio código.
- **El frontend manda nombres de campo viejos** en varias pantallas
  (`EstudiantesPage` → `grupoSanguineo`; `MatriculasPage` → `tipoBeca`,
  `porcentajeBeca`; `PlanillaNotasPage` → `valorMaximo`, `porcentaje`) que
  solo existían en el SQL roto, nunca en la base real. Con los DTOs nuevos
  (`forbidNonWhitelisted`), esos payloads se rechazan con 400 en vez de
  fallar en Postgres con 500 — más claro, pero el frontend sigue sin
  actualizarse. Es tarea de frontend, fuera del alcance de este backend.

## La migración de creación (`1753600000000-CreateEducativoModule.ts`)

Crea las 31 tablas sin `SET LOCAL lock_timeout`, a diferencia de la
convención que el propio proyecto estableció después (commit `6071301f`).
**No se edita** — ya está aplicada en producción (la fila de `modulos_addon`
para `codigo = 'educativo'`, insertada por esta misma migración con
`createdAt` de 2026-07-27, es la prueba: si no hubiera corrido, esa fila no
existiría). No hay riesgo de que se re-ejecute: TypeORM registra cada
migración aplicada en su tabla de control y nunca vuelve a correr una ya
registrada; además, sus `CREATE TABLE IF NOT EXISTS` son idempotentes por si
alguna vez hiciera falta reproducir el esquema a mano. Ninguna acción
pendiente sobre este archivo.

## Tests

Un `*-sql.spec.ts` por service corregido (`config`, `estudiantes`,
`matriculas`, `academico`, `docentes`, `tutores`, `colegiatura`, `becas`) — capa
estática que lee el código fuente y confirma que usa las columnas/tablas
reales, más una capa gateada por `DB_HOST` (real, se salta en CI y en
cualquier entorno sin BD) que valida las sentencias con `EXPLAIN` (o, para el
caso de la restricción `NOT NULL` de `ed_planes_pago.nombre`, un `INSERT`
real dentro de una transacción que siempre hace `ROLLBACK`) — nunca escriben
una fila de verdad. No prueban lógica de negocio a propósito.
