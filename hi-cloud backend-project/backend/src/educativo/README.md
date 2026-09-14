# Módulo Educativo

**Estado: construido, sin clientes.** El módulo está registrado (`app.module.ts`,
guard de add-on, rutas de frontend, sidebar) y sus endpoints ya no revientan
contra Postgres — pero **0 empresas lo tienen contratado** y **0 filas** existen
en ninguna de sus 31 tablas. No hay urgencia por completarlo; tampoco hace
falta "retomar el desarrollo" para dejarlo seguro. Este documento existe para
que la próxima persona que lo abra no tenga que rehacer el inventario forense
de septiembre 2026.

## Qué funciona (9 submódulos, controller + service + rutas + guard)

| Submódulo | Archivo | Notas |
|---|---|---|
| Configuración académica | `config/` | Escalas de nota, letras, periodos, moneda de colegiatura. **No** es branding institucional (nombre/logo/colores) — ver "Decisiones de diseño" abajo. |
| Estructura académica | `estructura/` | Niveles, grados, secciones, asignaturas, pensum. |
| Dashboard | `dashboard/` | Solo lectura. |
| Estudiantes | `estudiantes/` | CRUD + tutores (relación N:N vía `ed_estudiante_tutores`). |
| Tutores | `tutores/` | CRUD. |
| Docentes | `docentes/` | CRUD + asignaciones (`ed_asignaciones_docente`). |
| Matrículas | `matriculas/` | CRUD + stats. Beca es FK a `ed_becas` (`becaId`), no un enum de texto. |
| Académico | `academico/` | Evaluaciones, calificaciones (bulk), asistencia (bulk + stats). |
| Colegiatura | `colegiatura/` | Planes de pago **por estudiante** (no por grado — ver abajo), cargos, pagos, resumen financiero. |

Todos los 9 controllers llevan `JwtAuthGuard, RolesGuard, TenantGuard,
ModuloAddonGuard('educativo')` — el guard estándar de add-on contratado
(consulta `empresa_modulos`, no `modulos_addon`), igual que taller/clínica/
farmacia/restaurante/etc. Todos los endpoints de escritura tienen DTO con
`class-validator` (antes eran `@Body() dto: any`, sin validación real pese al
`ValidationPipe` global).

## Qué tiene entidad pero ningún service (4 submódulos, 0% construido más allá de la tabla)

`EdDisciplina`, `EdLibro` + `EdPrestamo` (biblioteca), `EdRuta` (transporte) y
`EdComunicado` — sus tablas existen desde la migración original pero ningún
controller/service las usa. Deliberadamente **no** están en el
`TypeOrmModule.forFeature` de `educativo.module.ts` (ver el comentario ahí) —
así no quedan silenciosamente declaradas como si algo las usara. Si se
construye la API de alguna, hay que volver a agregarlas al `forFeature`.

`EdNotaPeriodo` (`ed_notas_periodo`, notas finales consolidadas por periodo)
tampoco la usa nadie — no es parte de los 4 anteriores ni de los 9
implementados, simplemente nunca se conectó.

## Qué no existe en absoluto (3 rutas, solo placeholder de frontend)

Comedor, enfermería y boletines: sin entidad, sin migración, sin nada — solo
una ruta de frontend con `EducativoPlaceholder`. Junto con biblioteca,
transporte, disciplina y comunicados (los 4 de arriba) suman las **8 rutas**
que muestran el placeholder. Antes decía "— próximamente" en gris chico
(se veía igual que una lista vacía); ahora dice explícito "Módulo no
disponible" con `Result status="info"`.

**Ninguno de estos 7 (comedor, enfermería, boletines, biblioteca, transporte,
disciplina, comunicados) se construye en esta tarea** — eso espera a que haya
un colegio interesado.

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
`matriculas`, `academico`, `docentes`, `tutores`, `colegiatura`) — capa
estática que lee el código fuente y confirma que usa las columnas/tablas
reales, más una capa gateada por `DB_HOST` (real, se salta en CI y en
cualquier entorno sin BD) que valida las sentencias con `EXPLAIN` (o, para el
caso de la restricción `NOT NULL` de `ed_planes_pago.nombre`, un `INSERT`
real dentro de una transacción que siempre hace `ROLLBACK`) — nunca escriben
una fila de verdad. No prueban lógica de negocio a propósito.
