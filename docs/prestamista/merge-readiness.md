# Prestamista — Informe de preparación para el merge a main

Fecha: 2026-10-12. Preparado sobre un checkout aislado de
`feat/prestamista-motor` (worktree separado, nunca se tocó `main`, no se
hizo push a ningún remoto). Este documento es el único entregable de ese
trabajo junto con `decisiones-pendientes.md`.

---

## 1. Resumen por etapa (2 a 7), en lenguaje simple

**Etapa 1** (ya cubierta por la auditoría previa, ver
`docs/auditorias/prestamista-etapa1.md`): el simulador de crédito y las
solicitudes, que antes estaban rotos de punta a punta, ahora funcionan.

**Etapa 2 — El motor de préstamos, de verdad.**
Antes, el cálculo de cuotas era básico y el método de pago "alemán"
(cuotas que bajan con el tiempo) nunca se usaba en la práctica aunque
existía la opción. Ahora:
- El sistema calcula préstamos con cualquier frecuencia de pago (diaria,
  semanal, quincenal, mensual, anual), permite períodos de gracia, cobra
  cargos por cuota y respeta los feriados al calcular fechas de pago.
- Un préstamo se puede desembolsar en varios tramos de efectivo en vez de
  entregar todo el dinero de una sola vez (por ejemplo, para préstamos de
  construcción pagados por avance de obra).
- Si el cajero cobra un pago por error o hay que revertirlo, ahora se
  puede **anular con reversa completa** (nunca se borra el registro,
  queda visible quién lo anuló y por qué) — antes no había forma correcta
  de corregir un pago cobrado por error.
- Los garantes (avales personales) y las garantías (colateral, como un
  vehículo) ahora tienen un ciclo de vida completo: se pueden liberar o
  marcar como ejecutadas (el bien se queda con la financiera por impago),
  y nunca se liberan solos automáticamente al pagarse el préstamo — alguien
  tiene que confirmarlo.
- Si un deudor no puede seguir pagando como estaba, ahora hay dos caminos
  distintos y claros: **refinanciar** (se cierra el préstamo viejo y se
  abre uno nuevo con el saldo) o **reestructurar** (el mismo préstamo,
  pero con un plan de cuotas nuevo). Además, se puede **condonar**
  (perdonar) mora o interés pendiente sin tocar el capital — nunca se
  perdona el dinero prestado en sí. Las tres operaciones requieren que una
  segunda persona (supervisor) las autorice; ni siquiera un Administrador
  puede aprobarse esto a sí mismo.
- Se puede generar un contrato/pagaré en PDF para firmar con el deudor.

**Etapa 3 — Cobranza de mora.**
Antes no había ninguna herramienta para gestionar préstamos atrasados más
allá de mirar la lista. Ahora:
- Un préstamo atrasado sube de "alerta" a "acción legal" automáticamente
  según los días de mora (5, 15, 30 y 60 días), como guía visual para el
  cobrador.
- Se puede asignar cada préstamo a un cobrador específico, registrar cada
  gestión de cobro (llamada, visita, mensaje) y anotar promesas de pago o
  incumplimientos.
- Se puede reasignar la cartera de un cobrador a otro, préstamo por
  préstamo (no hay todavía un botón de "mover toda la cartera de un
  golpe").
- Se puede avisar al deudor por correo o por un link de WhatsApp manual
  (no un envío automático — todavía ningún cliente de HiCloud tiene un
  proveedor de WhatsApp Business configurado).

**Etapa 4 — Un tablero de control y reportes.**
Antes no había manera de ver, de un vistazo, cómo está la cartera de
préstamos de la empresa. Ahora hay un Dashboard con indicadores clave
(cuánto está prestado, cuánto está en mora, los deudores con más deuda) y
12 reportes exportables a Excel/CSV. Durante la construcción de esta etapa
se encontró y corrigió un hueco real de seguridad: un reporte podía, en
ciertos casos, mezclar datos de préstamos de otra empresa (otro cliente de
HiCloud) con los propios — ya cerrado.

**Etapa 5 — Conectado con caja, contabilidad y facturación electrónica.**
Antes, el dinero de préstamos vivía "fuera" del resto del sistema contable
del ERP. Ahora:
- Si un cajero cobra una cuota en efectivo o entrega un desembolso en
  efectivo, ese dinero entra o sale del cuadre de caja del turno, igual
  que una venta o un gasto — así el cajero no tiene una caja "que no
  cuadra" por un movimiento de préstamos que el sistema no contaba. Esto
  se puede apagar por empresa si una financiera prefiere manejar el
  efectivo de préstamos por fuera del POS.
- Los asientos contables (cartera, intereses, mora, cargos, desembolsos,
  refinanciamientos, condonaciones) ya se generaban automáticamente; se
  revisó a fondo y no se encontró ningún hueco.
- El interés de un préstamo ya emitía comprobante fiscal (e-CF) exento de
  ITBIS, como antes. Ahora la mora y los cargos **también pueden** emitir
  su propia línea en ese comprobante, pero solo si el producto de préstamo
  lo configura explícitamente — mientras ningún producto lo configure (que
  es la situación de hoy), no cambia nada de lo que ya se facturaba.

**Etapa 6 — Un hallazgo crítico de seguridad, corregido.**
Al auditar el módulo se encontró que un usuario con el rol "Contador" (que
ni siquiera tiene permiso para usar la pantalla de "Condonar deuda") podía
lograr el mismo efecto — perdonar mora o interés sin límite y sin que una
segunda persona lo autorizara — usando la pantalla de "Refinanciar" en
vez de la de "Condonar". Es decir, había una puerta trasera para evitar el
control de doble autorización que el propio negocio había pedido. Ya está
cerrada: ahora refinanciar con condonación exige la misma autorización
dual que condonar directamente, y el monto condonado nunca puede superar
lo que el deudor realmente debe. También se corrigieron un problema menor
(dos clics casi simultáneos podían aprobar la misma solicitud dos veces)
y un error de redacción en el registro de auditoría.

**Etapa 7 — Un puntaje de riesgo del deudor (scoring).**
No hay inteligencia artificial ni "machine learning" en esto — es una
calculadora de reglas transparente: a partir del historial real del
deudor (si paga puntual, si tiene mora activa, si ha necesitado
refinanciar o que le condonen deuda antes, si tiene préstamos pagados
limpios en el pasado, si tiene garantías o garantes de respaldo), el
sistema calcula un número de 0 a 100 y una banda de A (mejor) a E (peor),
mostrando siempre el detalle de por qué salió ese número. **Nunca aprueba
ni rechaza nada por sí solo** — es solo una señal más para que el oficial
de crédito decida, igual que todo lo demás en este módulo.

---

## 2. Archivos fuera de `src/prestamista` y de las páginas de prestamista que cambian

Comparación exacta: `git diff main...feat/prestamista-motor --stat` (140
archivos, +16.917/-516) y luego `--numstat` filtrando todo lo que vive bajo
`src/prestamista/`, `pages/prestamista/` o `docs/prestamista/`. Quedan
**28 archivos** fuera del módulo. Se revisó el diff completo de cada uno
(no solo el resumen) — se citan líneas/funciones exactas.

### Caja y cierre de caja

**`hi-cloud backend-project/backend/src/caja/caja.service.ts`** — en
`calcularEfectivoEsperado()`/`recalcularDesdeBD()` y
`desglosePorFormaDePago()` se agregaron dos queries nuevas contra
`pr_pagos`/`pr_desembolsos_parciales` (cobros/desembolsos de préstamo en
efectivo imputados a la caja) y dos campos nuevos en `getEmpresaCfg()`
(`prestamoEfectivoPorCaja`, default `true`).

- **Lo que SÍ cambia para una empresa sin préstamos**: nada en el
  resultado. Las dos queries nuevas filtran por `cajaDiariaId`/`empresaId`
  contra tablas que, sin uso de Prestamista, no tienen ninguna fila que
  haga match — devuelven 0 y los campos nuevos (`cobrosPrestamoEfectivo`,
  `desembolsosPrestamoEfectivo`) quedan en 0, igual que si no existieran.
  El cálculo final (`calcularEfectivoEsperado`) solo suma/resta estos
  campos cuando vienen con valor (son `?` opcionales en
  `efectivo-esperado.util.ts`); con 0 no mueven el resultado.
- **Riesgo real, aunque menor**: el interruptor `prestamoEfectivoPorCaja`
  tiene **default `true`** (línea: `prestamoEfectivoPorCaja: cfg.prestamoEfectivoPorCaja !== false`),
  así que **toda empresa existente**, incluidas las que nunca activarán
  Prestamista, ejecuta las 2 queries nuevas en cada recálculo de caja y en
  cada desglose por forma de pago — no hay gate por "¿esta empresa tiene
  el módulo Prestamista activo?", solo por el valor de una config que por
  default es `true` para todos. Es overhead de consulta, no un cambio de
  resultado (las queries son baratas — filtran por índice de empresa/caja
  sobre tablas vacías para esos tenants) pero sí dos round-trips a la base
  de datos que hoy no existían, en una ruta que corre para cada cierre de
  caja de cada empresa del ERP.
- **El HTML/ticket térmico impreso no se tocó**: no hay ningún archivo de
  plantilla de impresión (ni backend ni frontend) en el diff que referencie
  estos campos — se confirmó con `grep` en todo el repo que
  `cobrosPrestamoEfectivo`/`desembolsosPrestamoEfectivo` solo aparecen en
  los 4 archivos de caja de Prestamista Etapa 5 y en su doc. El ticket que
  ya se corrigió en los últimos 5 commits de `main` (cuadre por forma de
  pago, columnas CSS) no cambia de comportamiento ni de HTML para ninguna
  empresa.

**`hi-cloud backend-project/backend/src/caja/efectivo-esperado.util.ts`** —
`EntradasEfectivo` gana dos campos **opcionales**
(`cobrosPrestamoEfectivo?`, `desembolsosPrestamoEfectivo?`) y
`calcularEfectivoEsperado()` los suma/resta con `num(e.campo)` (que trata
`undefined` como 0). Un caller que no los pasa (cualquier código viejo,
cualquier test viejo) obtiene exactamente el mismo resultado que antes.
Riesgo: ninguno.

**`hi-cloud backend-project/backend/src/caja/entities/cierre-caja.entity.ts`**
— dos columnas nuevas `@Column({ type: 'decimal', ..., default: 0 })`.
TypeORM + Postgres: columna nueva con default, filas viejas quedan en 0.
Riesgo: ninguno sobre datos existentes.

### Contabilidad (asientos automáticos)

**`hi-cloud backend-project/backend/src/contabilidad/services/asientos-automaticos.service.ts`**
— se tocaron dos métodos ya existentes para agregarles un parámetro nuevo
**con default**:
- `asientoDesembolsoPrestamo(...)` gana `cargoAperturaRetenido: number = 0`.
- `asientoPagoPrestamo(...)` gana `cargosAplicados: number = 0`.

Ningún caller fuera de Prestamista invoca estos dos métodos (son
exclusivos de ese módulo), así que esto es 100% aditivo en la práctica,
pero igual es relevante señalarlo porque es un archivo **compartido por
toda la contabilidad del ERP** — cualquier error de sintaxis o de tipo
aquí rompería asientos de facturas/compras/NC de cualquier empresa, no
solo de préstamos. El resto del diff son dos métodos enteramente nuevos
(`asientoRefinanciamiento`, `asientoCondonacionPrestamo`), sin tocar nada
preexistente. Riesgo: bajo, pero es el archivo con más "radio de
explosión" si algo saliera mal en un futuro cambio sobre esa misma zona.

### e-CF (facturación electrónica)

**`hi-cloud backend-project/backend/src/ecf/use-cases/emitir-ecf.use-case.ts`**
— el cambio está contenido dentro de la rama que arma el "documento
origen" para `DocumentoOrigenTipo.PAGO_PRESTAMO` (pagos de préstamo), un
tipo de documento que **solo existe** cuando el e-CF se está emitiendo
para un pago de préstamo. Se agregó `lineaFiscalPrestamo()` (función
nueva) y las líneas de mora/cargos solo se agregan si
`motorConfig.fiscal[concepto].generaComprobante === true` — hoy, en todos
los productos existentes, `fiscal` está vacío, así que `detalles` queda
igual que antes (solo la línea de interés, exenta). **No se tocó ningún
otro tipo de documento de e-CF** (facturas, NC, ND, gastos) — el resto del
archivo (el motor de e-CF que usan los 5.780 e-CF reales del negocio) no
aparece en el diff. Riesgo: ninguno para facturación normal.

### Auditoría

**`hi-cloud backend-project/backend/src/auditoria/interceptors/audit.interceptor.ts`**
— se agregaron dos ramas **nuevas** en `generarDescripcion()`, ANTES de la
rama existente de "Condonar mora (educativo)":
```
if (r.includes('/prestamista/prestamos/') && r.includes('/condonar')) { ... }
if (r.includes('/prestamista/prestamos/') && r.includes('/reestructurar')) { ... }
```
Ambas condiciones exigen el prefijo de ruta `/prestamista/prestamos/`, que
ninguna ruta de Educativo (ni de ningún otro módulo) usa — no hay
colisión posible con la rama de condonación de Educativo que viene justo
después. Riesgo: ninguno, pero el orden de los `if` es importante y
cualquier futuro cambio en el prefijo de ruta de Prestamista debería
revisar esto.

### Modo Supervisor (autorización dual)

**`hi-cloud backend-project/backend/src/supervisor-politicas/guards/requiere-supervisor-siempre.guard.ts`**
— `RequiereSupervisorSiempre(clave, opts?)` gana un segundo parámetro
**opcional** `{ soloSi?: (body) => boolean }`. Si `opts.soloSi` no se pasa
(todo el código existente, que llama `RequiereSupervisorSiempre(clave)`
con un solo argumento), el comportamiento es idéntico al de antes —
"siempre se evalúa la política", explícito en el comentario del propio
diff. Riesgo: ninguno para los usos existentes (ej. ajustes de caja).

**`hi-cloud backend-project/backend/src/supervisor-politicas/supervisor-catalogo.ts`**
— 5 entradas nuevas en el catálogo (`pago_retroactivo`,
`anular_pago_prestamo`, `ejecutar_garantia`, `reestructurar_prestamo`,
`condonar_prestamo`), todas bajo un grupo nuevo "Prestamista /
Financiera". No se modificó ni se borró ninguna entrada existente.
Riesgo: ninguno.

### Módulos comunes / configuración / UI compartida

**`hi-cloud frontend-project/src/pages/configuracion/ConfiguracionPage.tsx`**
— se agregó un switch nuevo "Efectivo de préstamos por la caja del
cajero" dentro de `SeccionPOS`, la pantalla de configuración de POS que
usan **todas las empresas**, sin ninguna condición que lo oculte si la
empresa no tiene Prestamista activo. **Riesgo de producto, no técnico**:
cualquier cliente de HiCloud que no usa préstamos va a ver este switch en
su configuración (con su explicación "Apágalo si el módulo Prestamista
maneja su efectivo fuera de la caja del POS") sin tener ningún motivo para
entenderlo o tocarlo. No rompe nada, pero es ruido/confusión evitable —
candidato a ocultarse detrás de un flag de "módulo Prestamista activo"
antes de mostrarse a todos.

**`hi-cloud frontend-project/src/components/ui/WhatsAppButton.tsx`** —
tipo `TipoDocumento` y los mapas `ENDPOINT`/`PDF_ENDPOINT` ganan 3 entradas
nuevas (`recibo-prestamo`, `recordatorio-mora-prestamo`). Los tipos y
endpoints existentes no cambian. Riesgo: ninguno.

**`hi-cloud frontend-project/src/App.tsx`** y
**`hi-cloud frontend-project/src/config/menuConfig.ts`** — una ruta/ítem de
menú nuevo (`/prestamista/feriados`), anidado bajo el grupo de rutas de
Prestamista que ya existía (gateado igual que el resto del módulo).
Riesgo: ninguno.

**`hi-cloud frontend-project/src/api/prestamista.api.ts`** — solo agrega
funciones nuevas al objeto `prestamistalApi`; ninguna función existente
cambia de firma de forma incompatible (el único cambio en una función
existente es `registrarPago(body, headers?)`, con el segundo parámetro
opcional). Riesgo: ninguno.

**`hi-cloud backend-project/backend/package.json`** — un script npm nuevo
(`seed:prestamista-motor`). **`hi-cloud backend-project/backend/tsconfig.json`**
— se fija `tsBuildInfoFile` explícito, un fix de build incremental de
TypeScript que **beneficia a todo el backend** (antes, un `.tsbuildinfo`
viejo podía hacer que `tsc` reportara "0 errores" sin haber compilado
nada tras borrar `dist/`). No es específico de Prestamista; es una mejora
general. Riesgo: ninguno (cambio aislado de config de build).

### Seeds y specs (no corren en producción)

`hi-cloud backend-project/backend/src/seeds/seed-prestamista-motor.ts` es
un script de datos de prueba, solo se ejecuta a mano
(`npm run seed:prestamista-motor`), nunca automáticamente. Los demás
archivos de la lista de 28 (specs: `audit.interceptor.spec.ts`,
`caja.service.spec.ts`, `efectivo-esperado.util.spec.ts`,
`emitir-ecf-pago-prestamo.spec.ts`, `requiere-supervisor-siempre.guard.spec.ts`)
son tests — no corren en producción, solo en CI/local.

### Conclusión de la sección

De los 28 archivos fuera del módulo, **ninguno cambia el resultado
observable para una empresa que no usa Prestamista** — todo el código
nuevo está detrás de: (a) un `WHERE` contra tablas `pr_*` que para esas
empresas no tiene filas, (b) parámetros opcionales con default que
preservan el comportamiento viejo, o (c) rutas/condiciones de interceptor
que exigen el prefijo `/prestamista/`. La única excepción es el switch de
`ConfiguracionPage.tsx`, que es un riesgo de **ruido de producto**, no de
corrección de datos ni de seguridad.

---

## 3. Migraciones

8 migraciones nuevas en `hi-cloud backend-project/backend/src/migrations/`
(timestamps 1771000000000 a 1781000000000), todas revisadas línea por
línea:

| Migración | Qué hace | Tablas que toca | ¿Destructiva? | `down()` funcional |
|---|---|---|---|---|
| `1771000000000-AddClaveIdempotenciaToPrPagos` | Agrega `pr_pagos.claveIdempotencia` + índice único parcial (empresaId, clave) para que un doble clic/reintento no duplique un pago. | `pr_pagos` | No | Sí — dropea índice y columna. |
| `1772000000000-MotorV2Prestamista` | Agrega config del motor v2 a productos y préstamos (`motorConfig`, `motorVersion` default `'v1'`), campos de cargos/período de gracia a cuotas, y crea tabla `pr_feriados`. | `pr_productos_prestamo`, `pr_prestamos`, `pr_cuotas`, `pr_feriados` (nueva) | No | Sí — dropea tabla, índice y columnas en orden inverso. |
| `1773000000000-RegistrarPagoRediseno` | Agrega `tipoPago`/`formasPago`/`montoExtraCapital` a pagos (pago mixto por varias formas). | `pr_pagos` | No | Sí. |
| `1774000000000-SimulacionesPrestamo` | Crea tabla `pr_simulaciones` + 2 índices; agrega `pr_solicitudes.simulacionId` (nullable, trazabilidad opcional). | `pr_simulaciones` (nueva), `pr_solicitudes` | No | Sí. |
| `1775000000000-PrestamistaAnulacionGarantiasGarantes` | Agrega columnas de anulación a pagos, estado/liberación a garantes, y rastro de ejecución a garantías. | `pr_pagos`, `pr_garantes`, `pr_garantias` | No | Sí — dropea todas las columnas agregadas, en orden inverso. |
| `1778000000000-PrestamistaEtapa2RestoP2` | Crea tabla `pr_desembolsos_parciales`; agrega `pr_prestamos.desembolsado` con **backfill** (`UPDATE ... SET desembolsado = montoPrincipal WHERE desembolsado IS NULL`) antes de volverla `NOT NULL`; agrega columnas de condonación a cuotas. | `pr_desembolsos_parciales` (nueva), `pr_prestamos`, `pr_cuotas` | No (el backfill es correcto: trata préstamos viejos como "100% desembolsados", que es la realidad) | Sí — aunque al bajar se pierde el dato de `desembolsado` que se había calculado (esperado: es una columna nueva, no había nada que perder antes de esta migración). |
| `1780000000000-PrestamistaCobranzaEtapa3` | Agrega `cobradorId`/`cobradorNombre` a préstamos + índice. | `pr_prestamos` | No | Sí. |
| `1781000000000-PrestamistaEtapa5CajaFiscal` | Agrega `cajaDiariaId` a pagos y desembolsos; agrega `cobrosPrestamoEfectivo`/`desembolsosPrestamoEfectivo` (`NOT NULL DEFAULT 0`) **a `cierres_caja`**. | `pr_pagos`, `pr_desembolsos_parciales`, **`cierres_caja`** (tabla compartida por TODO el sistema de caja/POS) | No — `ADD COLUMN ... DEFAULT 0`, nunca pierde ni altera una fila existente | Sí — dropea las 4 columnas en orden inverso. |

**Hallazgos de la revisión:**
- **Ninguna migración usa `DROP TABLE`/`DROP COLUMN` en su `up()`**, ni
  reescribe datos existentes de forma destructiva. El único `UPDATE` masivo
  (`1778000000000`, backfill de `desembolsado`) es seguro y semánticamente
  correcto.
- **Solo una migración toca una tabla fuera de `pr_*`**: `1781000000000`
  agrega 2 columnas a `cierres_caja`. Es aditivo (`DEFAULT 0`, `NOT NULL`)
  y consistente con el patrón ya usado en el ERP para
  `gastos.cajaDiariaId` (la migración lo cita explícitamente como
  precedente). No hay índice ni FK nuevos sobre `cierres_caja`, así que no
  hay impacto de performance en escritura para esa tabla.
- **Todas usan `SET LOCAL lock_timeout`** antes de cada `ALTER TABLE` —
  mismo patrón defensivo que el resto de migraciones del ERP, para no
  bloquear la tabla indefinidamente si hay un lock concurrente.
- **Todas tienen un `down()` real**, no vacío ni "no-op falso" — cada una
  revierte exactamente las columnas/tablas/índices que creó, en el orden
  inverso correcto (dependientes antes que la tabla base).
- **Numeración**: el rango 1771000000000–1781000000000 no colisiona con
  ninguna migración de `main` (los 4 commits de `main` que no estaban en
  esta rama —correcciones de cuadre de caja— no agregaron migraciones
  nuevas; se confirmó con `git diff feat/prestamista-motor...main --stat`
  antes del merge de la sección 4).

---

## 4. Estado de la rama contra main

Antes de actualizar: `feat/prestamista-motor` tenía **90 commits** que
`main` no tiene, y `main` tenía **4 commits** que la rama no tenía (los
últimos 4 commits de "Recent commits" del repo: fixes de cuadre de caja
por forma de pago, cuadre térmico al tamaño del cuerpo, y columnas del
cuadre con CSS — todos del 2026-10-11/12). El commit de "sesión deslizante
de 30 días" (`73e8ce8b`) **ya era ancestro común** de ambas ramas, así que
no hacía falta traerlo.

**Se actualizó la rama** con `git merge main --no-edit` (merge, no
rebase — la rama ya está pusheada a `origin/feat/prestamista-motor` y
compartida, así que un rebase reescribiría historia que otros/CI ya
tienen). El merge fue **completamente limpio, sin conflictos**: Git
auto-mezcló el único archivo que ambos lados tocaban
(`hi-cloud backend-project/backend/src/caja/caja.service.spec.ts` — main
le ajustó expectativas del cuadre por forma de pago, Prestamista le
agregó casos nuevos de `cobrosPrestamoEfectivo`/`desembolsosPrestamoEfectivo`
en regiones distintas del archivo) sin generar ningún marcador
`<<<<<<<`/`=======`/`>>>>>>>` — confirmado con una búsqueda de esos
marcadores en el archivo después del merge. No hizo falta ninguna
resolución manual.

Después del merge (commit local `41b7b15f`, "Merge branch 'main' into
feat/prestamista-motor"): `feat/prestamista-motor` queda **0 commits
detrás y 91 commits adelante** de `main`. **No se hizo push** de este
commit de merge a ningún remoto — queda únicamente en este checkout local
aislado, como se pidió.

---

## 5. Resultado de la suite completa (después de la actualización)

Corrido en esta rama, después del merge de la sección 4, en el checkout
aislado (`npm ci` fresco en ambos proyectos, ya que el worktree no traía
`node_modules`).

**Backend**
- `npx tsc --noEmit` → **limpio, sin errores.**
- `npx jest` (suite completa) → **4977 tests pasados, 0 fallos.**
  (`Test Suites: 12 skipped, 333 passed, 333 of 345 total` /
  `Tests: 131 skipped, 1 todo, 4977 passed, 5109 total`, 245.1s). Los
  `skipped` son los mismos de siempre en este repo (tests de integración
  contra Postgres real que no corren sin esa BD levantada) — no son
  fallos.

**Frontend**
- `npx tsc --noEmit` → **limpio, sin errores.**
- `npm run build` (`tsc && vite build`) → **compila y empaqueta sin
  error** (`✓ built in 2m 11s`). El único mensaje es el warning estándar
  de Vite sobre chunks >500kB después de minificar (`vendor-antd`,
  `index-*`) — es preexistente al tamaño del bundle del ERP completo, no
  algo que este roadmap haya introducido; no es un fallo de build.
- `npx vitest run` (suite completa) → **falló en la primera corrida**:
  `Test Files 2 failed | 79 passed (81)`, `Tests 6 failed | 679 passed (685)`,
  600.8s. Los 2 archivos que fallaron:
  - `src/components/clientes/SelectClienteConAlta.test.tsx` (3 tests,
    **ajeno a Prestamista** — es un componente de Clientes) — los 3
    fallan con `Error: Test timed out in 10000ms`.
  - `src/pages/prestamista/DetallePrestamo.anulacion-garantias.test.tsx`
    (3 de sus 9 tests) — mismo patrón, `Error: Test timed out in 30000ms`.

  **Se verificó que es la misma flakiness ya documentada, no una
  regresión real**: se volvieron a correr esos 2 archivos solos
  (`npx vitest run src/components/clientes/SelectClienteConAlta.test.tsx
  src/pages/prestamista/DetallePrestamo.anulacion-garantias.test.tsx`) y
  los **17 tests de ambos archivos pasaron limpio, 0 fallos**, 89.7s
  (`Test Files 2 passed (2)`, `Tests 17 passed (17)`). Esto confirma
  exactamente lo anotado en `README.md` y en
  `decisiones-pendientes.md`/la memoria del usuario
  (`feedback_deuda_test_nc_compras_lento`): bajo la suite COMPLETA de
  Vitest con todos los workers en paralelo, estos archivos (con Selects
  de antd encadenados dentro de un Modal, o — en el caso del test de
  Prestamista — varias mutaciones PATCH + refetch por test) compiten por
  CPU con las otras ~683 pruebas y exceden su timeout individual; corridos
  solos o en un grupo chico, pasan sin tocar nada. No hay ningún cambio de
  código de esta tarea que explique la falla — es contención de recursos
  del runner, deuda de infraestructura de pruebas ya aceptada y ya
  presente en `main` antes de este roadmap (ver
  `feedback_deuda_test_nc_compras_lento.md`, mismo patrón con
  `NotasCreditoComprasPage`).

**Conclusión de la sección**: typecheck y build, 100% limpios en ambos
proyectos. La suite de tests, 100% en verde en backend; en frontend, en
verde salvo la flakiness de infraestructura ya conocida y verificada aquí
mismo como no-regresión (pasa limpio aislado). No se encontró ningún
fallo nuevo ni relacionado con el merge de la sección 4.

---

## 6. Recomendación final

**Recomendación: mergear en dos partes, no de una sola vez.**

Justificación con lo encontrado en las secciones 2 y 3:

1. **Parte 1 — todo lo aislado dentro del módulo**: el 100% del código
   bajo `src/prestamista/`, `pages/prestamista/`, las migraciones que solo
   tocan tablas `pr_*` (7 de las 8), los seeds, specs, y los archivos
   puramente aditivos fuera del módulo (API client, rutas de menú,
   WhatsAppButton, catálogo de supervisor, guard con parámetro opcional,
   package.json/tsconfig). Este bloque no tiene ningún camino de código
   que un cliente sin Prestamista pueda ejercitar de forma distinta a
   hoy — es, en la práctica, código muerto para ellos hasta que activen el
   módulo.

2. **Parte 2 — la integración con caja/contabilidad/fiscal**: la
   migración `1781000000000` (la única que toca `cierres_caja`, tabla
   compartida), los cambios en `caja.service.ts`/`efectivo-esperado.util.ts`/
   `cierre-caja.entity.ts` (el interruptor `prestamoEfectivoPorCaja` con
   default `true`, que agrega 2 queries a CADA cierre de caja de CADA
   empresa), los métodos nuevos de `asientos-automaticos.service.ts`, el
   cambio en `emitir-ecf.use-case.ts`, y el switch nuevo en
   `ConfiguracionPage.tsx`.

**Por qué separar**: la Parte 1 es matemáticamente imposible de romper
para un cliente sin préstamos (no hay ningún `if` que dependa de datos
ajenos a `pr_*`). La Parte 2, en cambio, modifica el camino caliente de
**todas** las empresas (cierre de caja corre para cada turno de cada
POS activo del ERP) — aunque el análisis de la sección 2 concluye que el
resultado numérico no cambia para quien no usa préstamos, es la única
zona donde un error de regresión futuro (de cualquier desarrollador, no
necesariamente de este roadmap) podría filtrarse a clientes que nunca
pidieron este módulo. Mergear esa porción por separado, con un ciclo de
observación en producción antes de la Parte 1 completa (o después, según
se prefiera), permite revertir solo esa pieza si algo se detecta, sin
tener que revertir las 90 (91) commits completos del roadmap.

Si el dueño del producto prefiere simplicidad operativa sobre el margen
de seguridad extra, mergear todo junto **no está bloqueado por nada
encontrado en este informe** — no hay ningún hallazgo de la sección 2 o 3
que en sí mismo sea motivo de no mergear; la recomendación de dividir es
puramente una medida de prudencia dado que la Parte 2 toca el camino más
usado de todo el ERP (caja/POS), no una señal de que algo esté mal hecho.
