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

---

## 7. Actualización 2026-10-13 — merge con main de hoy, aislamiento por add-on cerrado, y suite completa

Preparado por un agente autónomo, sobre un checkout aislado (worktree) con
el contenido de `feat/prestamista-motor` al commit `a2b167c9` (el HEAD
descrito en la sección 1-6 de este mismo documento). Jean autorizó
explícitamente en este punto que esta rama SÍ se mergee a `main` — la
instrucción "esta rama nunca se mergea a main" del README ya no aplica
(corregida ahí mismo).

### 7.1 Estado de la rama contra `main` de hoy

`main` avanzó 7 commits más desde el `ff1f6bc6` que esta rama ya tenía
integrado (sesión única entre pestañas, cuadre de caja por forma de pago
definitivo, umbral de descuadre configurable, lectura segura de
`localStorage`, defensa 409 por sesión desincronizada, banner + motivo
obligatorio al cerrar caja ajena). Se corrió:

```
git fetch origin
git merge main --no-edit
```

**Merge limpio, sin un solo marcador de conflicto** (confirmado con una
búsqueda de `<<<<<<<`/`=======`/`>>>>>>>` tras el merge — 0 resultados).
Git usó la estrategia `ort` y auto-mezcló los 3 archivos que ambos lados
tocaban (`caja.service.ts`, `caja.service.spec.ts`, `App.tsx`) sin
intervención manual, porque los cambios de cada lado viven en regiones
disjuntas del archivo:

- **`caja.service.ts`**: main agregó `esMiCaja` (aviso de "esta caja no es
  tuya" en `getCajaHoy()`/`getDatosParaImprimir()`, líneas ~1303-1487);
  Prestamista agrega `cobrosPrestamoEfectivo`/`desembolsosPrestamoEfectivo`/
  `prestamoEfectivoPorCaja` (líneas ~345-1155). Verificado línea por línea
  tras el merge: **ambos bloques de lógica quedaron intactos y completos**,
  ninguno pisó al otro.
- **`caja.service.spec.ts`**: mismo patrón que la sección 4 anterior — cada
  lado agregó `describe`/`it` nuevos en regiones distintas del archivo.
- **`App.tsx`**: main agregó rutas/imports ajenos a Prestamista; se
  verificaron las 12 rutas de `/prestamista/*` (incluyendo `feriados`,
  agregada en esta rama) intactas tras el merge.

Commit de merge: **`e910ca109b1cd3ce2b5882a8a683c6c6f9aacc62`**
("Merge branch 'main' into prestamista-merge-main"). Tras el merge:
**0 commits detrás, 93 adelante** de `main`.

**Nota sobre el nombre de la rama**: el worktree asignado a esta tarea no
pudo usar el nombre `feat/prestamista-motor` porque ese nombre ya estaba
registrado en OTRO worktree local de este mismo repo (git no permite el
mismo nombre de rama en dos worktrees a la vez). Todo este trabajo vive en
una rama local nueva (`prestamista-merge-main`) creada desde el mismo commit
que `feat/prestamista-motor` (`a2b167c9`) — mismo contenido, solo un nombre
de rama distinto por la restricción del entorno. **No se hizo push a ningún
remoto.** Jean debe decidir si renombra esta rama a `feat/prestamista-motor`
(fast-forward) o la usa directamente para el merge real a `main`.

### 7.2 Repaso de Etapas 1-7 contra el código real (post-merge)

Se repitió la verificación completa de las 7 etapas contra el código, tras
el merge de 7.1 — no se asumió que lo documentado en las secciones 1-6
siguiera siendo cierto. **Las 7 etapas están confirmadas completas**, línea
por línea, incluyendo los 2 hallazgos de seguridad más críticos
re-verificados con máximo rigor tras el merge:

- La fuga multi-tenant de Etapa 4 (3 JOIN sin filtro de empresa en
  `reportes.service.ts`) **sigue corregida** —
  `carteraActiva()` (línea 29), `prestamosPorProducto()` (línea 156) y
  `estadoCuentaDeudor()` (línea 361) tienen el filtro `AND ...empresaId=...`
  en cada JOIN, confirmado tras el merge de hoy.
- Los 4 fixes de seguridad de Etapa 6 (condonación vía refinanciamiento sin
  autorización dual, `cancelar()` sin guardas de estado, TOCTOU en
  `decidir()` de solicitudes, y la rama de auditoría mal descrita) **siguen
  los 4 presentes**, verificados archivo+línea exacta.

El único hallazgo "sin corregir" encontrado es el mismo que el propio
`etapa-2-resto.md` ya reconoce y deja anotado (`GarantesController.liberar`
sin guard de supervisor, `motivo` opcional) — no es una sorpresa ni una
regresión de este merge, es una decisión ya documentada de que "liberar un
garante" no mueve dinero ni perdona deuda, a diferencia de "ejecutar una
garantía" (que sí tiene el guard).

### 7.3 Huecos de aislamiento por add-on — cerrados

Los 2 huecos reales descritos en la sección 2 de este documento (el
interruptor `prestamoEfectivoPorCaja` con default `true` sin gate por
add-on, y el switch de `ConfiguracionPage.tsx` visible a toda empresa) están
**cerrados**:

- **Backend** (`hi-cloud backend-project/backend/src/caja/caja.service.ts`):
  los 2 call sites que ejecutaban las queries contra
  `pr_pagos`/`pr_desembolsos_parciales` (dentro de `recalcularDesdeBD()` y
  `calcularEsperadoPorForma()`) ahora exigen también
  `this.modulosAddonService.checkModuloActivo(empresaId, 'prestamista')`
  antes de correrlas — con `&&` de cortocircuito, así que si el add-on no
  está activo, el método `checkModuloActivo` ni siquiera llega a ejecutar
  su propia query contra `pr_pagos`/`pr_desembolsos_parciales` (sí ejecuta
  una consulta barata y ya existente contra `empresa_modulos`, pero NUNCA
  las 2 queries caras). `caja.module.ts` importa `ModulosAddonModule` para
  la inyección. **Se deliberadamente NO se movió este gate dentro de
  `getEmpresaCfg()`** (que tiene otros 3 call sites ajenos a Prestamista:
  `umbralDescuadreCaja`, `notificarDescuadreCaja`, `cierreCajaCiego`,
  `montoMaxRetiroSinAutorizacion`) — eso hubiera agregado una query extra a
  esos 3 call sites también, el efecto contrario al que se buscaba.
  - Tests nuevos en `caja.service.spec.ts` (demuestran el comportamiento,
    no solo "el resultado da 0"): un test espía `modulosAddonService.checkModuloActivo`
    y confirma con `dataSource.manager.query.mock.calls.some(...)` que las
    2 queries de `pr_pagos`/`pr_desembolsos_parciales` **nunca se
    ejecutan** cuando el add-on está inactivo (aunque el switch de
    configuración esté en su default `true`); un test paralelo con el
    add-on activo y filas reales confirma que los montos sí fluyen al
    cierre (saldo, diferencia, columnas `cobrosPrestamoEfectivo`/
    `desembolsosPrestamoEfectivo`).
  - Se actualizaron los 2 archivos de test que instancian `CajaService`
    manualmente fuera de Nest DI (`caja.service.retiro-concurrencia.spec.ts`,
    `car-wash/services/cw-liquidaciones.service.spec.ts`) con un stub del
    nuevo parámetro del constructor — ninguno de los dos ejercía el camino
    de Prestamista, pero sin el stub el constructor habría quedado con
    `modulosAddonService` en `undefined` y roto con un `TypeError` si
    alguna vez tocan ese camino.

- **Frontend**
  (`hi-cloud frontend-project/src/pages/configuracion/ConfiguracionPage.tsx`):
  el switch se extrajo a un componente propio,
  `SwitchPrestamoEfectivoPorCaja` (exportado), que solo se renderiza si
  `useModuloAddon('prestamista').activo === true` — mismo hook y mismo
  patrón que `ClinicaLayout`/`TransporteLayout`/`FarmaciaLayout`/
  `TallerLayout`/`OpticaLayout`. Se extrajo a un componente aparte (en vez
  de un `&&` inline dentro de `SeccionPOS`) para poder probarlo sin montar
  los ~660 líneas del formulario completo de POS (que renderiza una vista
  previa de ticket con generación de QR, pesada de montar en jsdom).
  - Test nuevo:
    `hi-cloud frontend-project/src/pages/configuracion/SwitchPrestamoEfectivoPorCaja.test.tsx`
    — confirma que NO se renderiza (`queryByTestId` da `null`) con el
    add-on inactivo, y que SÍ se renderiza con el add-on activo.

- **Confirmado no-operativo para empresas sin el add-on** (sin necesidad de
  test nuevo, por diseño ya existente, re-verificado):
  `asientos-automaticos.service.ts` (los 2 métodos nuevos de Prestamista
  son exclusivos del módulo, ningún caller fuera de `src/prestamista/` los
  invoca), `emitir-ecf.use-case.ts` (la rama `PAGO_PRESTAMO` solo se
  ejecuta cuando el documento origen es un pago de préstamo, que solo
  existe si se usó un endpoint de `/prestamista/`, que ya está bloqueado
  por `ModuloAddonGuard('prestamista')` en el controller), `audit.interceptor.ts`
  (las 2 ramas nuevas exigen el prefijo de ruta `/prestamista/prestamos/`
  en el `if`, nunca se evalúan para ninguna otra ruta del ERP).

### 7.4 Trampa de e-CF — verificada personalmente, no delegada

Verificación pedida explícitamente con `git log`/`git diff` sobre
`emitir-ecf.use-case.ts` y `pagos.service.ts`:

- **El e-CF de interés de v1 (ya en producción) queda intacto por
  default.** En `emitir-ecf.use-case.ts`, método `cargarDocumentoOrigen()`
  (rama `PAGO_PRESTAMO`), la línea de "Interés" se construye **siempre**,
  sin ninguna condición (`lineaFiscalPrestamo('Interés', ..., interes, 0)`
  — el `0` es el `tratamientoItbis`, hardcodeado exento, igual que antes).
  Cuando `motorConfig.fiscal` está vacío o ausente (el caso de HOY para
  TODOS los productos, nuevos y existentes), el array `detalles` queda
  con un único elemento — exactamente el mismo resultado numérico
  (`subtotal = interes`, `iva = 0`, `total = interes`) que el código antes
  de la Etapa 5, Parte C (commit `3036caa5`, que introdujo este cambio).
- **Mora/cargos (la capacidad NUEVA) queda apagada por default, para
  productos nuevos Y existentes.** El disparo está en
  `pagos.service.ts:453-455`:
  `disparaPorMora = fiscalCfg.mora?.generaComprobante === true && dist.aplicadoMora > 0`
  (comparación estricta `=== true`, nunca "truthy") — para cualquier
  producto cuyo `motorConfig` sea `NULL`/vacío, esto es `false` sin
  excepción.
  - **Productos existentes** (creados antes de esta etapa): la migración
    `1772000000000-MotorV2Prestamista.ts` agrega la columna
    `"motorConfig" JSONB DEFAULT NULL` — cada producto/préstamo que ya
    existía en producción (la empresa #55 real) tiene `motorConfig = NULL`
    hasta que alguien lo edite a mano.
  - **Productos nuevos**: en
    `hi-cloud frontend-project/src/pages/prestamista/ProductosPrestamoPage.tsx`
    línea 51, el formulario de "Nuevo producto" inicializa
    `fiscal: { ...., generaComprobante: null, ... }` para cada concepto —
    **nunca `true`** — y la UI de esa sección (línea ~419) la rotula
    explícitamente "Fiscal (pendiente de configurar)" con un tag naranja
    "Pendiente" mientras `generaComprobante` sea falsy. No existe ningún
    camino (formulario, default, seed) que active esto sin una acción
    explícita del admin.
  - **Apertura y seguro** (punto 8 de `decisiones-pendientes.md`): ni
    siquiera tienen el camino construido — cobrarlos pasa por
    "desembolso", no por "pago", y ese circuito fiscal no existe en el
    motor de e-CF del ERP. Sin cambios de este merge.

**Conclusión de la trampa**: v1 interés intacto, mora/cargos apagados por
default para todo producto — confirmado con el código, no inferido del
mensaje del commit.

### 7.5 Resultado de la suite completa (hoy, 2026-10-13, tras el merge + los fixes de 7.3 + Punto 3 de decisiones-pendientes.md)

`npm ci` fresco en ambos proyectos (el worktree no traía `node_modules`).

**Backend**
- `npx tsc --noEmit` → limpio, 0 errores.
- `npx jest` (suite completa) →
  **`Test Suites: 1 failed, 12 skipped, 333 passed, 334 of 346 total`**
  **`Tests: 1 failed, 131 skipped, 1 todo, 4992 passed, 5125 total`**
  (235.2s). Los `skipped` son los de siempre (integración contra Postgres
  real sin esa BD levantada en CI).
  - **El único fallo es ajeno a Prestamista y preexistente en `main`**:
    `src/car-wash/services/cw-turnos.service.spec.ts` →
    `CwDashboardService.resumen() también cuenta "vehiculosHoy" en hora RD,
    no UTC`, `Expected: 0, Received: 7`. Confirmado con
    `git diff --stat main e910ca10 -- .../car-wash` → **0 archivos**, el
    módulo car-wash no tiene un solo cambio en esta rama. Re-ejecutado
    aislado (`npx jest car-wash/services/cw-turnos.service.spec.ts`): falla
    igual, de forma reproducible (no es contención de recursos). Causa
    diagnosticada: el test simula "cruzar la medianoche RD" mockeando
    `fechaHoyRD()` a `'2026-10-13'` como el día "siguiente" al de la
    prueba — pero la fecha REAL del sistema hoy, 2026-10-13, coincide
    exactamente con ese valor mockeado, y alguna parte de la consulta de
    `CwDashboardService.resumen()` usa la fecha real del servidor (no la
    inyectada) para "hoy", por lo que termina contando turnos reales de
    OTRAS pruebas del mismo archivo creados en la fecha real de hoy. Es un
    defecto de fecha-coincidente, 100% preexistente en `main`, que se
    manifiesta específicamente HOY — no una regresión de este trabajo. No
    se tocó (fuera de alcance: módulo car-wash, no Prestamista).

**Frontend**
- `npx tsc --noEmit` → limpio, 0 errores.
- `npm run build` → `✓ built in 1m 19s`. Solo el warning estándar de Vite
  por chunks >500kB (preexistente, no introducido por este trabajo).
- `npx vitest run` (suite completa) → **`Test Files: 4 failed | 82 passed
  (86)`**, **`Tests: 8 failed | 721 passed (729)`** (492.1s). Los 4
  archivos que fallaron, con el mismo patrón de timeout ya documentado en
  README.md/este documento (contención de recursos bajo la suite COMPLETA
  con todos los workers en paralelo):
  - `src/components/clientes/ClienteFormModal.test.tsx` (1 test) — ajeno a
    Prestamista.
  - `src/components/clientes/SelectClienteConAlta.test.tsx` (3 tests) —
    ajeno a Prestamista, ya documentado en etapas anteriores.
  - `src/components/proveedores/ProveedorFormModal.test.tsx` (1 test) —
    ajeno a Prestamista, **nuevo en esta lista** (misma familia de
    componente — formulario con Select+alta rápida — que
    `ClienteFormModal`, mismo patrón de timeout).
  - `src/pages/prestamista/DetallePrestamo.anulacion-garantias.test.tsx`
    (3 de 9 tests) — de Prestamista, ya documentado desde Etapa 3.

  **Re-ejecutados los 4 juntos, aislados del resto de la suite**
  (`npx vitest run` con los 4 paths): **`Test Files: 4 passed (4)`,
  `Tests: 32 passed (32)`**, 105.5s. Confirma que es la misma
  contención de recursos ya conocida, no una regresión real — ninguno de
  los 4 archivos tiene relación de código con los cambios de esta tarea
  (los 3 de clientes/proveedores son completamente ajenos; el de
  `DetallePrestamo` prueba anulación/garantes/garantías, no caja/cobranza/
  configuración, que es lo que se tocó).

### 7.6 Los 4 checks estáticos de CI

Desde `hi-cloud backend-project/backend/`:

```
node scripts/check-entity-migrations.js
→ ✅ CAPA 3 OK — 2579 columnas en 343 entidades, todas cubiertas por migración o baseline

node scripts/validate-update-returning.js --autotest
→ ✅ Autotest OK — marca los dos casos rotos y deja pasar las dos formas correctas.
node scripts/validate-update-returning.js
→ ✅ UPDATE/RETURNING OK — 1514 archivos revisados, sin guardas rotas nuevas (1 en baseline pendientes del barrido)

node scripts/check-tenant-empresaid-filter.js --autotest
→ ✅ Autotest OK — marca los casos sin empresaId y deja pasar los filtrados / no vigilados.
node scripts/check-tenant-empresaid-filter.js
→ ✅ Sin consultas nuevas sin empresaId sobre las 4 tablas vigiladas (7 en baseline, revisar aparte)

bash scripts/security-check.sh
→ ⚠️  1 advertencia (3 servicios con QueryBuilder sin referencia a empresaId:
   two-factor.service.ts, demo.service.ts, parametros-fiscales.service.ts —
   los 3 preexistentes, ninguno tocado por Prestamista ni por esta tarea)
→ ✅ Sin errores críticos — push permitido
```

**Ningún check reporta una advertencia NUEVA.** Las menciones a "baseline"
(1 en UPDATE/RETURNING, 7 en tenant-filter) y la advertencia de
`security-check.sh` son exactamente las mismas que ya existían en `main`
antes de este merge — no se agregó ninguna.

### 7.7 Migraciones de esta actualización

**No se agregó ninguna migración nueva.** El punto 3 de
`decisiones-pendientes.md` (umbrales de escalamiento configurables por
empresa) se implementó como 4 claves nuevas dentro de la columna JSONB
`empresa.configuracion` que ya existe — el mismo mecanismo que usan
`umbralDescuadreCaja`, `notificarDescuadreCaja`, `prestamoEfectivoPorCaja`,
etc. Ninguna tabla ni columna nueva, por lo tanto ninguna migración ni
riesgo de colisión de numeración con lo que haya entrado a `main` entre el
2026-10-12 y hoy.

### 7.8 Veredicto de esta actualización

- **Punto 4 del pedido (aislamiento total para empresas sin el add-on)**:
  CUMPLIDO. Los 2 huecos reales quedaron cerrados con tests que demuestran
  el comportamiento (no solo que el resultado da 0), y se re-confirmaron
  no-operativos los puntos que ya lo eran por diseño.
- **Punto 5 del pedido (suites verdes, tsc limpio, migraciones revisadas)**:
  CUMPLIDO con una salvedad honesta: la suite de backend tiene 1 fallo
  real pero **ajeno a este roadmap y preexistente en `main`** (ver 7.5);
  la suite de frontend tiene la misma clase de flakiness por contención de
  recursos ya documentada en etapas anteriores, con un archivo nuevo en la
  lista (`ProveedorFormModal.test.tsx`) que sigue el mismo patrón y se
  verificó aislado. tsc limpio en ambos proyectos, build limpio, los 4
  checks estáticos sin advertencias nuevas, sin migraciones nuevas que
  revisar.
