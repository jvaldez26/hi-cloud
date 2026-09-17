# Módulo Educativo

**Estado: construido, sin clientes.** El módulo está registrado (`app.module.ts`,
guard de add-on, rutas de frontend, sidebar) y sus endpoints ya no revientan
contra Postgres — pero **0 empresas lo tienen contratado** y **0 filas** existen
en ninguna de sus 31 tablas. No hay urgencia por completarlo; tampoco hace
falta "retomar el desarrollo" para dejarlo seguro. Este documento existe para
que la próxima persona que lo abra no tenga que rehacer el inventario forense
de septiembre 2026.

## Qué funciona (17 submódulos, controller + service + rutas + guard)

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
| Colegiatura | `colegiatura/` | Planes de pago **por estudiante** (no por grado — ver abajo), cargos, pagos, resumen financiero, mora (cron diario) y condonación de mora. Ver "Tanda 5" abajo. |
| Becas | `becas/` | Catálogo (`ed_becas`) + asignación a estudiantes (`ed_estudiante_becas`) — conectado a `generarCargos()`/`generarMatricula()`, ver "Becas" abajo. UI en `/educativo/becas`. |
| Boletines | `boletines/` | Consolidación de notas por período + PDF individual/masivo. Ver "Boletines" abajo. |
| Disciplina | `disciplina/` | Incidentes con tipo/categoría/medida/seguimiento, notificación a padres con fecha. Un docente (vinculado por `ed_docentes.usuarioId`) solo ve/reporta incidentes de sus propias secciones (`ed_asignaciones_docente`) — admin y el resto ven todo. Nunca loguea el contenido del incidente. |
| Biblioteca | `biblioteca/` | Libros + préstamos (a estudiante o a docente). `cantidadDisponible` con lock pesimista al prestar/devolver — nunca queda negativa. Estado `vencido` se deriva de `fechaVencimiento`, nunca se escribe. |
| Transporte | `transporte/` | Rutas (chofer, vehículo, capacidad, paradas) + asignación de estudiantes con control de capacidad (lock pesimista). Al asignar, genera cargos de transporte por el mismo motor que colegiatura (`ed_cargos`, tipo='transporte') — ver "Transporte" abajo. Becas no aplican (`ed_becas.aplicaA` no contempla 'transporte'). |
| Comunicados | `comunicados/` | CRUD, destinatario todos/grado/sección/individual (`ed_comunicados.estudianteId`, migración `1763600000000`). `enviarWhatsapp`/`enviarEmail` se guardan pero no disparan nada — el envío real queda para cuando exista una integración real (ver "Comunicados" abajo). |
| Comedor | `comedor/` | Plan por estudiante (tipo diario/semanal/mensual, costo mensual, restricciones alimenticias). Genera cargos por el mismo motor que transporte/colegiatura (`ed_cargos`, tipo='comedor') — ver "Tanda 3" abajo. Becas no aplican. |
| Enfermería | `enfermeria/` | Registro de visitas (motivo, síntomas, atención, medicamento, notificación a padres, envío a casa, quién atendió). **Acceso restringido a `UserRole.ADMIN`** — es el único submódulo con `@Roles()`. Sin exportación a Excel. Ver "Tanda 3" abajo — es el módulo más sensible del sistema. |
| Reportes | `reportes/` | Los 14 reportes del plan original — solo lectura, sin entidad propia. Ver "Tanda 4" abajo. |

Todos los controllers llevan `JwtAuthGuard, RolesGuard, TenantGuard,
ModuloAddonGuard('educativo')` — el guard estándar de add-on contratado
(consulta `empresa_modulos`, no `modulos_addon`), igual que taller/clínica/
farmacia/restaurante/etc. Todos los endpoints de escritura tienen DTO con
`class-validator` (antes eran `@Body() dto: any`, sin validación real pese al
`ValidationPipe` global).

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

## Tanda 3 (septiembre 2026): comedor, enfermería

Los últimos 2 submódulos que existían solo como tabla (sin entidad, sin API).

- **`CargosServicioService` (`common/cargos-servicio.service.ts`)** — motor
  de cargos EXTRAÍDO de transporte y reusado tal cual por comedor: mismo
  `generarCargos()`/`anularCargosFuturosSinPagar()`, mismo `generate_series`
  en SQL para evitar el bug de `DataSource.query()` devolviendo columnas
  `date` como objetos `Date` de JS (atrapado en transporte en la tanda 2, ver
  arriba — comedor lo evitó desde el diseño al reusar el service ya
  corregido, en vez de copiar la lógica). Transporte se refactorizó para
  inyectar este service en vez de mantener su propia copia — un solo camino
  para generar deuda del estudiante, no tres. Cada consumidor solo aporta su
  propio `concepto` de trazabilidad (`transporte:ruta=X;asignacion=Y`,
  `comedor:plan=X`) y su `tipo` (`'transporte'`/`'comedor'`) en `ed_cargos`.
- **Comedor** — plan por estudiante, un plan activo a la vez (bloquea un
  segundo plan activo con 400). Baja a mitad de año: mismo criterio que
  transporte (anula solo cargos futuros sin pagar). Becas no aplican
  (`ed_becas.aplicaA` no contempla `'comedor'`).
- **Enfermería — el módulo más sensible del sistema.** Datos médicos de
  menores. Decisión de acceso reportada y confirmada ANTES de implementar
  (no hay rol "enfermería"/"dirección" propio en `UserRole` — dirección y
  enfermería comparten hoy la cuenta admin): **`@Roles(UserRole.ADMIN)`** en
  el controller, además del guard estándar del módulo — el único submódulo
  de todo `educativo` con `@Roles()`. `super_admin` siempre pasa (comportamiento
  estándar de `RolesGuard`). Un docente (rol `vendedor`/`viewer`/etc., no
  `admin`) recibe 403 de la API y la ruta `/educativo/enfermeria` lo redirige
  a `/dashboard` (`menuConfig.ts` → `PATH_ROLES`). La pestaña "Salud" del
  expediente del estudiante (`EstudiantesPage.tsx`) ni se monta en el DOM
  para un rol no admin — no es un estilo oculto, el item del array de tabs
  no existe. Ningún método de `enfermeria.service.ts` pasa
  `motivo`/`sintomas`/`atencionBrindada`/`medicamentoDado` a un logger, a un
  mensaje de excepción ni a Sentry — solo el id numérico del registro,
  mismo principio que disciplina en la tanda 2. Alergias/condiciones médicas
  ya existentes en `ed_estudiantes` se muestran como contexto al registrar
  una visita (`GET .../contexto-medico`) — no se duplican. Sin exportación a
  Excel: si alguien necesita el dato, lo ve en pantalla.
- **Base de pruebas local:** el swap de `.env` a `hicloud_test` (ver sección
  de este README más abajo) ahora tiene sus credenciales guardadas en
  `.env.test.local` (gitignorado) para no perderlas entre sesiones.

Verificado con Playwright contra `hicloud_test`, igual que la tanda 2
(`e2e/comedor.spec.ts`, `e2e/enfermeria.spec.ts`) — incluyendo el bloqueo de
acceso de un docente a enfermería, tanto por API directa (403) como por
ruta (redirect) y por ausencia de la pestaña Salud en el DOM.

## Tanda 4 (septiembre 2026): los 14 reportes del plan original

Último bloque pendiente del módulo. Todos en `reportes/` (controller +
service + un DTO de filtros compartido) — sin entidad ni migración propia,
son vistas agregadas de solo lectura sobre tablas que ya existen. Mismo
guard estándar del módulo en el controller; ninguno usa `Repository` ni
QueryBuilder, todo `DataSource.query()` con `empresaId` siempre primero en
el `WHERE` — la causa de los 26 bugs de este módulo en la auditoría del
2026-09-06 fue exactamente identificadores de tabla escritos a mano sin
verificar, así que cada tabla usada aquí se confirmó contra su entidad real
antes de escribir la consulta (`security-check.sh` también lo barre en CI).

- **Cartera de colegiatura y morosidad por grado (1-2)** — el más delicado
  de cuadrar: `carteraColegiatura()` llama literalmente a
  `ColegiaturaService.resumenFinanciero()`, el mismo método que
  `GET educativo/colegiatura/resumen` (la pantalla de Colegiatura). Si este
  reporte recalculara "vencido" con su propio criterio, el número no
  cuadraría con lo que el colegio ya ve en pantalla — se reusa tal cual, sin
  reimplementar. El desglose por estudiante y la morosidad por grado usan la
  MISMA definición de vencido copiada de ese método
  (`estado IN ('vencido','parcial') OR (estado='pendiente' AND
  fechaVencimiento < CURRENT_DATE)`), nunca una propia.
- **Rendimiento académico, estudiantes en riesgo, cuadro de honor (4-6)** —
  los tres leen `ed_notas_periodo` (la tabla que `BoletinesService.
  calcularNotasPeriodo()` ya consolida y que los boletines reales muestran),
  nunca recalculan desde `ed_calificaciones` por su cuenta. El umbral de
  "riesgo" es `ed_config.notaMinimaAprobar` (el que el colegio ya configuró
  para aprobar/reprobar, no un número inventado aquí) — override opcional
  por query param.
- **Asistencia por grado y exceso de ausencias (7-8)** — sobre
  `ed_asistencia`, mismos estados que `academico.service.ts` usa
  (`presente/ausente/tardanza/justificado`). El umbral de "exceso" es un
  parámetro (`umbral`, default 5), no una política fija en código.
- **Matrícula y crecimiento, retención (9, 12)** — comparan
  `ed_anios_escolares` consecutivos por `fechaInicio`. Retención devuelve
  también el listado de estudiantes NO retenidos (no solo el %) porque es
  el dato que el colegio realmente puede accionar.
- **Incidentes disciplinarios por tipo (10)** — el único reporte con
  restricción por rol: reusa el mismo mecanismo de `disciplina.service.ts`
  (vínculo `ed_docentes.usuarioId` → `ed_asignaciones_docente`) — un docente
  ve solo el conteo de sus propias secciones, nunca el total del colegio.
  La página `/educativo/reportes` completa ya estaba restringida a
  admin/contador desde antes (`menuConfig.ts` → `PATH_ROLES`, preexistente)
  — un docente (rol `vendedor` en este sistema, no hay rol "docente" propio)
  no llega a la pantalla en absoluto; el filtro por sección se verificó
  contra el endpoint directamente, autenticado como ese usuario.
- **Ingresos por concepto (11)** — `ed_pagos` con un `LEFT JOIN` a
  `ed_cargos` para leer `tipo` (colegiatura/transporte/comedor/matrícula) —
  el mismo join que `listPagos()` ya usa en colegiatura, no uno nuevo.
- **Becas otorgadas (13)** — el listado sale de `ed_estudiante_becas`; el
  monto total otorgado NO se recalcula (una beca puede ser % o monto fijo,
  no hay un "total" único sin contexto) — se lee de
  `ed_cargos.concepto` (`beca:<id>:<monto>`), el mismo formato que
  `ColegiaturaService.calcularDescuento()` ya escribe en cada cargo real.
  Es el monto que efectivamente se descontó, no una proyección aparte.
- **Productividad docente (14)** — a propósito SOLO carga: secciones,
  asignaturas y estudiantes por docente (`ed_asignaciones_docente` +
  `ed_matriculas`). Ninguna métrica de desempeño (promedio de sus
  estudiantes, % de aprobación, etc.) — no es una evaluación docente, la
  tarea lo pidió explícito.
- **Enfermería no tiene reporte** — ninguno de los 14 lo pide, a propósito
  no se agregó uno.

Exportación a Excel: mismo mecanismo 100% frontend que el resto del ERP
(`utils/exportExcel.ts`, cliente arma el `.xlsx` del array ya cargado) — los
endpoints solo devuelven JSON, no hay ruta de exportación en el backend.
Un solo componente de página (`EducativoReportesPage`, calcado de
`generador-reportes/GeneradorReportesPage.tsx`, el único patrón existente en
el ERP que combina selector de reporte + filtros + tabla + export real a
Excel) con un selector de `Tag`s para los 14 en vez de `Tabs` — a esa
cantidad, pestañas horizontales dejan de ser manejables.

**De paso, en esta misma tanda:** se corrigió `e2e/comunicados.spec.ts`
(pedido explícito del usuario, en su propio commit) — un flake real de
timing de esta máquina de verificación (el `click` de un Select de antd a
veces no llegaba a abrir el dropdown a tiempo, confirmado registrando el
elemento real bajo el punto de click en corridas repetidas), no un bug de
la app. El helper `selectAntOption`, duplicado idéntico en 6 specs, se
extrajo a `e2e/helpers/antd.ts` con reintento acotado (15s) en vez de un
solo intento que colgaba el test entero. También se encontró y corrigió un
bug real reportado en vivo por el usuario: un modal de edición con un campo
disabled (`estudianteId` en Disciplina, `pacienteId`/`medicoId` en una
consulta de Clínica) seguía viajando en el PATCH pese a estar deshabilitado
— `disabled` no desregistra el campo del form — y el Update DTO
correspondiente lo rechazaba con 400 `forbidNonWhitelisted`. Ver el commit
`fix: campos disabled/faltantes se filtran de los PATCH de edición`.

Verificado con Playwright contra `hicloud_test` (`e2e/reportes.spec.ts`,
7 tests) con datos sembrados a propósito para que ningún reporte salga
vacío: un año escolar anterior cerrado (crecimiento/retención), notas bajas
y altas (riesgo/honor), ausencias reales (exceso), pagos de colegiatura +
transporte + comedor (ingresos por concepto), y el filtro por sección del
reporte de disciplina verificado contra el usuario docente de prueba.

## Tanda 5 (septiembre 2026): cron de mora + condonación

`montoMora`/`diasMora` existían en `ed_cargos` desde la migración original
sin que nadie los escribiera nunca. `mora.cron.ts` (dentro de `colegiatura/`,
registrado como provider en `EducativoModule` — no hay un módulo central de
crones, cada uno vive en el módulo de dominio al que pertenece, mismo patrón
que `prestamista/cobranza/mora.cron.ts`) corre diario a las 5:00 UTC (1:00
a.m. RD) y recalcula la mora de todo cargo vencido y no pagado.

**Decisiones tomadas (no reabrir sin hablarlo):**

- La mora se **recalcula completa cada día**, nunca se acumula sumando — un
  cron que corra dos veces el mismo día no duplica nada (verificado en vivo).
- La mora **nunca se cobra sobre la mora**: la base es siempre
  `montoOriginal - descuento` (nunca `montoTotal`, que ya trae la mora de
  ayer adentro). Un abono parcial reduce esa MISMA base sin mora — nunca el
  original completo ni el total con mora — así que la mora de mañana baja
  si hoy hubo un pago (verificado: RD$100 de mora bajó a RD$75 tras un abono
  de RD$500 sobre un cargo de RD$2,000).
- `diasGracia`/`cargoMoraPct` viven en `ed_planes_pago` (columnas que ya
  existían, "sin uso" según el propio README — ver "Decisiones de diseño"
  abajo) y son por PLAN, no por cargo. Un cargo sin plan (`planPagoId` null
  — transporte/comedor) sí pasa a `estado='vencido'` si corresponde (es un
  hecho, no depende de configuración) pero nunca genera `montoMora` — no
  hay tasa que aplicarle.
- El estado pasa a `'vencido'` en cuanto `fechaVencimiento < hoy`,
  independiente del período de gracia — la gracia solo retrasa cuándo
  empieza a cobrarse el interés, no si el cargo está o no vencido. Un cargo
  `'parcial'` que se vence pasa a `'vencido'`, nunca se queda en `'parcial'`
  (por eso `listCargos({vencidos:true})` se actualizó para usar la misma
  definición de "vencido" que `resumenFinanciero()`, en vez de su fallback
  anterior de antes de que este cron existiera).
- `montoTotal`/`saldoPendiente` son derivados y se escriben SIEMPRE junto
  con `montoMora`, en el mismo punto — mismo principio que
  `registrarPago()`/`updateCargo()` ya seguían.
- Lock pesimista (`FOR UPDATE` en transacción) sobre cada cargo, idéntico al
  de `registrarPago()` — verificado en vivo: una transacción reteniendo el
  lock bloquea genuinamente un pago concurrente sobre el mismo cargo hasta
  soltarlo, no hay pérdida de escritura.
- Solo procesa empresas con el add-on `'educativo'` activo — misma query
  exacta que `ModuloAddonGuard` contra `empresa_modulos` (no hay
  `TenantService`/CLS involucrado: el cron pasa `empresaId` explícito en
  cada `WHERE`, igual que el resto del módulo — no hace falta
  `runForEmpresa()` salvo que se llame a un método que internamente use
  `tenantService.getEmpresaId()`, que ninguno de este cron hace).
- Usa `diferenciaDiasRD()` (no `toISOString()`) para los días de mora —
  la utilidad ya existente que compara contra `fechaHoyRD()` anclando a
  mediodía UTC, así evita el mismo bug de `fechaVencimiento` volviendo como
  `Date` de JS (zona del proceso) en vez de string, atrapado en transporte
  en la tanda 2.

**Condonar mora** (`POST educativo/colegiatura/cargos/:id/condonar-mora`,
motivo obligatorio vía DTO): pone `montoMora=0`, recalcula `montoTotal`/
`saldoPendiente` juntos, y marca `moraCondonada=true` — el cron excluye para
siempre a un cargo condonado (condonar no serviría de nada si la mora
reaparece al día siguiente). `diasMora` NO se toca: queda como registro
histórico de cuánto tiempo estuvo en mora, independiente de que se haya
perdonado el monto. Cada condonación queda en `ed_cargos_condonaciones`
(migración `1763700000000`) — empresaId, cargoId, montoCondonado, motivo,
usuarioId, fecha — separada del `audit_logs` genérico porque esta SÍ
necesita ser consultable por cargo (`listCargos()` la adjunta como
`condonacionesMora`, mismo espíritu que `desgloseDescuento` con las becas).
De paso, `audit.interceptor.ts` ahora reconoce `/condonar` como CRITICO con
descripción legible (motivo + monto), mismo patrón que ya existía para
`/inventario/ajuste`.

Frontend: `ColegiaturaPage.tsx` → tab Cargos, columna "Mora" (tag rojo con
el monto y los días en el tooltip, o "Condonada" si ya se perdonó) y botón
"Condonar mora" (solo visible si `montoMora > 0` y no está condonada ya).

Verificado en vivo contra `hicloud_test`: cargo vencido sin gracia, con
gracia (dentro y fuera del período), con abono parcial, ya pagado (no
genera mora), condonado (no reaparece tras un segundo cron), cron corrido
dos veces el mismo día (no duplica) y cron + pago concurrentes sobre el
mismo cargo (lock real, sin pérdida de escritura) — todo disparando
`MoraCronService.calcularMora()` directamente vía
`NestFactory.createApplicationContext()` (el cron no es HTTP, no hay
endpoint que lo dispare). El flujo de condonar sí es de cara al usuario:
cubierto por Playwright en `e2e/mora.spec.ts`.

## Tanda 6 (septiembre 2026): reconciliación de `ed_pagos`

Durante la tanda de colegiatura apareció que `ed_pagos.montoPagado` era
`NOT NULL` y nunca se llenaba — `registrarPago()` jamás se había ejecutado
antes de esa prueba. Se aplicó entonces un desbloqueo mínimo, pero el
diseño completo de la tabla quedó sin reconciliar. Diagnóstico completo:

- **`monto` vs. `montoPagado`** — el mismo par de columnas gemelas que
  `montoOriginal` en `ed_cargos` (tanda anterior). `dashboard.service.ts`
  (KPI "cobrado este mes") leía `montoPagado`; `colegiatura.service.ts` y
  `reportes.service.ts` (`ingresosPorConcepto`) leían `monto`. Solo
  coincidían porque `monto` era la única que se escribía y `montoPagado`
  nunca se tocaba — el hallazgo original de esta tanda.
- **`cargoId` vs. `cargosAfectados` (JSONB)** — el esquema soporta las dos
  formas de vincular un pago con sus cargos, pero el código de hoy solo
  usaba `cargoId` (un pago = un cargo); `cargosAfectados` nunca se escribía
  ni se leía en ningún camino. En un colegio real el tutor paga dos o tres
  cuotas atrasadas de una vez — la respuesta correcta es "varios cargos",
  pero un JSONB que nadie puede unir en una query no es consultable/
  reportable, así que se reemplazó por una tabla de detalle real:
  **`ed_pagos_detalle`** (`empresaId`, `pagoId` FK→`ed_pagos` `ON DELETE
  CASCADE`, `cargoId` FK→`ed_cargos` `ON DELETE RESTRICT`, `monto`,
  `createdAt`) — un pago puede tener N filas, una por cada cargo que cubrió,
  consultable con un `JOIN` normal.
- **`facturaId`/`reciboId`/`notas`** — huérfanas sin ningún consumidor:
  educativo no tiene integración con facturación ni existe una tabla
  "recibos"; `notas` era un duplicado sin uso de `observaciones`. Las tres
  se eliminaron (migración `1763800000000-ReconciliarEdPagos.ts`, cero
  filas en producción — sin backfill).
- **`numero`/`tutorId`** quedan reservados sin uso, igual que
  `ed_cargos.numero` — documentado, no bloquea nada.

**Diseño final:**

- `registrarPago()` acepta `cargoIds: number[]` (o `cargoId` suelto, por
  compatibilidad — se normaliza a un arreglo de un elemento) del MISMO
  estudiante. Bloquea TODOS los cargos involucrados con `FOR UPDATE` en
  orden estable por `id` (nunca por `fechaVencimiento`) — así dos pagos
  concurrentes que comparten cargos siempre piden los locks en el mismo
  orden entre sí y no se pueden hacer deadlock cruzado.
- El monto se aplica siempre **al cargo con `fechaVencimiento` más antigua
  primero**, sin importar el orden en que el caller haya listado los
  `cargoIds` — el orden de aplicación se decide con los cargos ya
  bloqueados, no con el orden de entrada. Si el monto no alcanza para
  todos, los cargos que no llega a tocar **no reciben fila en
  `ed_pagos_detalle`** — nunca una fila de RD$0 fingiendo que se aplicó
  algo. Rechaza de entrada (antes de escribir nada) si el monto pedido
  supera la suma de lo pendiente de los cargos seleccionados.
- `recalcularCargoTrasPagos()` es el único punto que toca
  `montoPagado`/`saldoPendiente`/`estado` de un cargo tras un pago (o una
  anulación) — y SIEMPRE **resuma desde `ed_pagos_detalle`** (filtrado a
  pagos con `estado='activo'`), nunca por suma/resta incremental, para no
  arrastrar drift. Nunca toca `montoTotal`/`montoMora` — respeta lo que
  `mora.cron.ts` ya haya calculado sobre ese cargo (verificado en vivo:
  cron y pago concurrentes sobre el mismo cargo, sin deadlock, cada uno
  recompone su parte sobre la fila fresca que lee bajo su propio lock).
- `montoPagado` del pago (la columna `NOT NULL` original) es la única
  fuente de cuánto se cobró — siempre igual a la suma de sus filas en
  `ed_pagos_detalle`, nunca un número aparte que alguien pueda desincronizar.

**Anular un pago** (`POST educativo/colegiatura/pagos/:id/anular`, motivo
obligatorio vía DTO — no existía ningún mecanismo de reversión antes de
esta tanda): nunca borra el registro. Bloquea el pago (`FOR UPDATE`) y los
cargos que había cubierto (mismo orden estable por `id` que
`registrarPago()`), marca `ed_pagos.estado='anulado'` +
`motivoAnulacion`/`anuladoPor`/`anuladoEn`, y recalcula
`montoPagado`/`saldoPendiente`/`estado` de cada cargo afectado — como el
recálculo resuma desde `ed_pagos_detalle` filtrando `estado='activo'`, el
pago anulado deja de contar automáticamente y el saldo vuelve solo, sin
resta manual. Mismo patrón de auditoría "nunca borrar, solo marcar" que
`condonarMora()`. La ruta contiene `/anular`, que `audit.interceptor.ts` ya
reconocía como CRITICO desde la tanda de mora — no hizo falta tocar el
interceptor.

Frontend: `ColegiaturaPage.tsx` → `PagoModal` (botón "Pagar" de un cargo)
ahora ofrece marcar también otros cargos pendientes/vencidos del mismo
estudiante para cubrirlos en el mismo pago; nueva tab "Pagos" con el
historial (`listPagos()`, que devuelve `aplicaciones` resuelto por cargo) y
botón "Anular" (modal con motivo obligatorio) por cada pago activo.

Verificado en vivo contra `hicloud_test`: pago de un solo cargo, pago que
cubre tres cargos atrasados a la vez (aplicando al más antiguo primero,
sin importar el orden de `cargoIds`), pago parcial que no alcanza ni para
el cargo más antiguo (queda `'parcial'`, los demás cargos no reciben
ninguna fila de detalle), anulación de un pago multi-cargo (devuelve el
saldo a ambos cargos cubiertos, deja el registro con `estado='anulado'`) y
pago + cron de mora concurrentes sobre el mismo cargo (sin deadlock,
`montoMora`/`montoPagado` quedan consistentes sin importar cuál de los dos
terminó primero).

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
