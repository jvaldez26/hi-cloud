# Prestamista Etapa 3 — Cobranza — nota de diseño

**Estado: CERRADO el 2026-10-11.** Ver "Resumen (cerrado 2026-10-11)" al
final del documento.

A diferencia de las etapas anteriores, Cobranza **no partió de cero**: ya
existía `CobranzaService`/`CobranzaController` (cartera vencida, resumen,
gestiones, notificar mora por email) y `MoraCronService` (cálculo diario de
mora + clasificación `al_dia`/`moroso`/`vencido`), construidos antes de que
existiera la convención de documentar por etapas. Este documento parte de
una auditoría real de ese código (no de una lista de features en blanco) y
cubre solo lo que hacía falta para un flujo de cobranza de punta a punta.

---

## 1. Auditoría — qué había y qué faltaba

### 1.1 Lo que ya funcionaba (verificado línea por línea)

- `GET cartera-vencida`, `GET resumen`, `GET prestamo/:id/gestiones`,
  `POST gestiones`, `POST prestamo/:id/notificar-mora` — los 5 endpoints
  existían, con los 4 guards estándar (`JwtAuthGuard`/`TenantGuard`/
  `RolesGuard`/`ModuloAddonGuard('prestamista')`) y `empresaId` del CLS en
  cada query.
- `MoraCronService` corriendo a medianoche, clasificación correcta
  (`al_dia`/`moroso`/`vencido`), saldo de mora neto de lo cobrado (bug C4 ya
  cerrado antes de esta etapa).
- `CobranzaPage.tsx` — tabla de cartera vencida con Excel, botón "Gestión"
  (modal con tipo/resultado/próxima gestión/notas) y botón de email de
  recordatorio de mora. El export a Excel YA estaba — no hacía falta
  construirlo.
- `reportes.controller.ts` ya tenía `GET gestiones-cobranza` y
  `GET cartera-mora` (CSV) — son reportes de analítica/auditoría, un uso
  distinto al operativo de "a quién llamo hoy" de `CobranzaPage`. No se
  tocaron, no había solapamiento real.

### 1.2 Huecos reales encontrados

1. **El formulario de "Registrar Gestión" nunca pedía quién la hizo.**
   `RegistrarGestionDto` acepta `cobradorId`/`cobradorNombre`, pero
   `CobranzaPage.tsx` nunca los mandaba — toda gestión quedaba con
   `cobradorId NULL`. Sin esto no hay forma de calcular carga de trabajo
   por cobrador ni de filtrar "mi cartera". **Bug, no feature pendiente.**
2. **No existía asignación persistente de cartera.** `pr_prestamos` tenía
   `oficialId`/`oficialNombre` (quien originó el préstamo, fijo) pero nada
   para "a quién está asignada la cartera HOY" — un préstamo puede
   reasignarse de cobrador muchas veces en su vida (rotación de personal,
   redistribución de carga), el oficial de origen no cambia nunca.
3. **Sin indicador de "última gestión hace X días".** El frontend tenía la
   columna `ultimaGestion` definida en `COLS_DEF` pero **oculta por
   defecto** y el backend nunca la calculaba — `carteraVencida()` no hacía
   ningún JOIN contra `pr_cobranzas`. No había forma de priorizar a quién
   llamar hoy (el típico "llevas 20 días sin tocar este caso").
4. **Sin seguimiento de promesas de pago incumplidas.** El deudor promete
   pagar el 15, nadie pagó, nadie lo marca — `fechaPromesaPago` se guardaba
   en cada gestión pero nunca se leía en ningún lado.
5. **Sin escalamiento por días de mora.** El pedido original mencionaba
   recordatorio suave a los 5 días, gestión telefónica a los 15, carta a
   los 30 — no existía ninguna señal que sugiriera la siguiente acción.
6. **Recordatorio de mora solo por email** — si el deudor no tenía email
   registrado el botón quedaba deshabilitado sin alternativa, aunque el
   deudor normalmente SÍ tiene teléfono (es el dato que más se captura).

### 1.3 Infraestructura de notificación ya existente — qué se reusó y por qué

El pedido pedía auditar `whatsapp.service.ts` (Notificaciones) y
`comunicaciones.service.ts`/`comunicaciones.controller.ts` antes de asumir
que había que construir algo nuevo. Resultado de esa auditoría:

- **`WhatsAppService` (Notificaciones)**: envía por una API real (Meta
  Cloud / Twilio / 360dialog / Ultramsg) vía `fetch()`. Si
  `WHATSAPP_API_URL`/`WHATSAPP_TOKEN` no están configurados —que es el caso
  de **todos** los tenants hoy— simula el envío y solo deja un log. No hay
  ningún tenant con un proveedor de WhatsApp Business activado en
  producción.
- **`ComunicacionesService`**: no envía nada — genera un link `wa.me` con
  el texto codificado y lo abre el navegador (`WhatsAppButton.tsx`), el
  mismo patrón que usan Facturas, Cotizaciones, Conduces, CxC, NC y ND en
  todo el ERP. Es el mecanismo que realmente está en uso.
- **Precedente directo dentro del propio módulo**: `PagosController.whatsapp()`
  ya resuelve esto exacto para el recibo de pago — **self-contained dentro
  de Prestamista** (no acopla con `comunicaciones.service.ts`, que vive
  fuera del alcance del módulo), mismo armado de link `wa.me`.

**[DECISIÓN]** Para el recordatorio de mora por WhatsApp se replica
exactamente el patrón de `PagosController.whatsapp()`: un endpoint
`GET prestamo/:id/whatsapp-mora` que arma texto + link, sin enviar nada él
mismo — lo abre `WhatsAppButton.tsx` (se le agregó el tipo
`'recordatorio-mora-prestamo'`). Construir sobre `WhatsAppService` habría
sido prematuro: ningún tenant tiene el proveedor activado, y hubiera hecho
que el botón pareciera funcionar "de verdad" cuando en realidad solo
quedaría logueado en el servidor sin llegar al deudor.

**[DECISIÓN]** A diferencia del email (que SÍ registra una gestión
automática tras el envío, porque `EmailService.enviar()` confirma éxito/
fracaso real), el link de WhatsApp **no registra ninguna gestión por sí
solo** — no hay forma de confirmar que el deudor lo recibió (el navegador
simplemente abre WhatsApp). El cobrador registra la suya con el botón
"Gestión" si corresponde. Mismo criterio que `PagosController.whatsapp()`,
que tampoco registra nada.

---

## 2. Qué se construyó

### 2.1 Cobrador real en cada gestión (bug, no feature)

`CobranzaController.registrarGestion`/`notificarMora` ahora reciben el
usuario autenticado (`@GetUser()`) y `CobranzaService` lo usa como
**fallback** si el llamador no manda `cobradorId` explícito:
`data.cobradorId ?? usuarioActual?.id`. El formulario de "Registrar
Gestión" sigue sin pedirlo a mano — ya no hace falta, nunca fue una
decisión de UX pedirle al cobrador que se identifique a sí mismo.

### 2.2 Asignación persistente de cartera

Migración `1780000000000-PrestamistaCobranzaEtapa3`: `pr_prestamos.cobradorId`/
`cobradorNombre` (nuevo, nullable). Distinto de:

- `oficialId`/`oficialNombre` — quien originó el préstamo, nunca cambia.
- `pr_cobranzas.cobradorId` — snapshot de quién hizo CADA gestión puntual
  (ya existía, no se tocó).

`CobranzaService.asignarCobrador()` (nuevo) — `PATCH
prestamo/:id/cobrador`, ADMIN+CONTADOR (mismo nivel que editar garantías/
garantes; un VENDEDOR gestiona pero no reparte cartera). `cobradorId: null`
desasigna. `CobranzaService.listarCobradores()` (nuevo) — `GET cobradores`,
reusa el mismo criterio multi-tenant que `UsersService.findAll` (JOIN
`usuario_empresa` activo) pero accesible a VENDEDOR/CONTADOR, no solo ADMIN
como el endpoint `/users` — aquí es solo para poblar un selector, no para
administrar usuarios.

**[DECISIÓN]** Si un préstamo nunca se asignó a mano
(`cobradorId IS NULL`), `carteraVencida()` sugiere al **oficial que lo
originó** (`COALESCE(cobradorId, oficialId)`) en vez de dejarlo huérfano —
alguien ya tiene una relación con ese deudor desde el desembolso. Es solo
una sugerencia de lectura: asignar explícitamente no la sobrescribe salvo
que alguien lo pida.

### 2.3 "Última gestión hace X días" + escalamiento sugerido

`carteraVencida()` ahora hace `LEFT JOIN` contra un `DISTINCT ON` de
`pr_cobranzas` (última gestión por préstamo) y devuelve
`diasUltimaGestion`/`ultimaGestion`, ordenando la cartera por eso primero
(los que lleven más tiempo sin tocarse, arriba) y por días de mora después.

**[DECISIÓN — umbrales de escalamiento]** El pedido mencionó "recordatorio
suave a los 5 días, gestión telefónica a los 15, carta formal a los 30" sin
cerrar el resto de la escala. Se completó con un cuarto escalón a los 60
días (acción legal), mismo orden de magnitud que usa
`MoraCronService.clasificarMorosidad()` para pasar de `moroso` a `vencido`.
`nivelEscalamiento` es **puramente informativo** (una Tag en la UI) — nunca
bloquea nada ni dispara una acción por sí solo. Los umbrales están
hardcodeados en `CobranzaService` (no configurables por empresa todavía) —
ver `decisiones-pendientes.md` si alguna financiera necesita cambiarlos.

### 2.4 Promesas de pago incumplidas

Misma subconsulta de "última gestión" se reusa para calcular
`promesaIncumplida`: la **última** gestión del préstamo fue una
`resultado: 'promesa_pago'` cuya `fechaPromesaPago` ya pasó.

**[DECISIÓN — definición de "incumplida"]** Se usa la última gestión, no
"cualquier promesa vencida sin resolver". Si el cobrador hace seguimiento
(cualquier gestión nueva, sea cual sea el resultado) después de la fecha
prometida, la bandera se apaga sola — no hace falta un estado explícito de
"promesa resuelta". Esto evita que una promesa de hace 6 meses, ya seguida
y resuelta mil veces, siga ensuciando el reporte para siempre.

Se agregó el filtro `GET cartera-vencida?soloPromesasIncumplidas=true` (en
vez de un endpoint nuevo — es la misma tabla con un filtro más) y el
contador `promesasIncumplidas` en `GET resumen`.

### 2.5 Recordatorio de mora por WhatsApp

`CobranzaService.linkWhatsappMora()` (nuevo) — `GET
prestamo/:id/whatsapp-mora`, mismo texto/tono que el email pero formato
WhatsApp (`*negritas*`, emojis). `WhatsAppButton.tsx` ganó el tipo
`'recordatorio-mora-prestamo'`. Ver §1.3 para la decisión de no construir
sobre `WhatsAppService`.

### 2.6 Filtro "Mi cartera" / por cobrador

`GET cartera-vencida?cobradorId=<id>` filtra por
`COALESCE(cobradorId, oficialId) = :id`. El frontend agrega un selector
("Toda la cartera" / "Mi cartera" / cada cobrador por nombre, vía
`getCobradores()`) — "Mi cartera" resuelve el id desde `useAuthStore`.

### 2.7 Lo que NO se tocó a propósito

- **Exportar la cartera vencida** — ya existía (botón Excel), solo se le
  agregaron las columnas nuevas (escalamiento, cobrador, días desde la
  última gestión, promesa incumplida).
- **Reasignación masiva** (mover de un cobrador a otro TODA su cartera de
  un golpe) — quedó fuera, solo reasignación préstamo por préstamo. Ver
  `decisiones-pendientes.md`.
- **Umbrales de escalamiento configurables por empresa** — quedaron
  hardcodeados. Ver `decisiones-pendientes.md`.
- **Reglas de escalamiento en Modo Supervisor** — ninguna acción nueva de
  esta etapa mueve dinero ni cambia lo que el deudor debe (a diferencia de
  anular un pago o condonar mora), así que no se agregó ninguna clave
  nueva a `supervisor-catalogo.ts`. Registrar una gestión, reasignar
  cartera y notificar por email/WhatsApp son operativos, no financieros.

---

## 3. Tests

Mismo patrón que `mora.cron.spec.ts`/`e2e-flujo-completo.spec.ts`: un
`DataSource` simulado (dispatcher sobre arrays en memoria, no un parser
SQL) que responde a las queries exactas de `CobranzaService`, para probar
que el servicio real —tal cual está— encadena un flujo completo: registrar
gestión sin cobrador explícito → toma el usuario autenticado → promesa de
pago vencida se marca incumplida → el cobrador hace seguimiento → la
bandera se apaga sola → reasignar cartera → filtrar "mi cartera" →
notificar por email (falla sin registrar nada) / WhatsApp (nunca registra
nada solo) → `resumenCobranza` cuenta las promesas incumplidas →
aislamiento multi-tenant en los 3 métodos que escriben.

- `src/prestamista/cobranza/cobranza.service.spec.ts` — 17 tests nuevos.
- `src/prestamista/dto/prestamista.dto.spec.ts` — 10 tests nuevos
  (`RegistrarGestionDto`, `AsignarCobradorDto`): catálogos de tipo/
  resultado, montos negativos, y que `cobradorId` **no se puede mandar a
  mano** desde el body de "Registrar Gestión" (whitelist lo rechaza).

---

## Decisiones pendientes anotadas en `decisiones-pendientes.md`

| # | Decisión sin cerrar | Default aplicado |
|---|---|---|
| 1 | Umbrales de escalamiento (5/15/30 días dados, 60+ agregado) configurables por empresa | Hardcodeados en `CobranzaService`, iguales para todas |
| 2 | Reasignación masiva de cartera entre cobradores | Solo préstamo por préstamo, sin endpoint de "mover todo de X a Y" |
| 3 | WhatsApp Business real (API) para cobranza | Mismo link `wa.me` manual que el resto del ERP — ningún tenant tiene proveedor activado |

---

## Resumen (cerrado 2026-10-11)

Sesión que auditó el código de Cobranza ya existente (backend y frontend),
encontró 6 huecos reales (uno de ellos un bug: las gestiones quedaban sin
cobrador) y cerró Etapa 3 completa: backend + frontend + tests, sin tocar
`main`.

**Backend**: migración `1780000000000-PrestamistaCobranzaEtapa3`
(`pr_prestamos.cobradorId`/`cobradorNombre`); `CobranzaService` gana
`asignarCobrador`, `listarCobradores`, `linkWhatsappMora`, el cálculo de
`diasUltimaGestion`/`promesaIncumplida`/`nivelEscalamiento` en
`carteraVencida`, el contador `promesasIncumplidas` en `resumenCobranza`, y
el fallback de `cobradorId` al usuario autenticado en `registrarGestion`/
`notificarMora`; `CobranzaController` gana 3 endpoints
(`cobradores`, `whatsapp-mora`, `PATCH cobrador`) y pasa `@GetUser()` donde
corresponde. `AsignarCobradorDto` nuevo.

**Frontend**: `CobranzaPage.tsx` gana columnas de Escalamiento, Cobrador
(con reasignación inline) y Última Gestión (con bandera de promesa
incumplida), filtro "Mi cartera"/por cobrador, botón "Promesas
incumplidas", tarjeta de resumen nueva, y el botón de WhatsApp junto al de
email. `WhatsAppButton.tsx` gana el tipo `'recordatorio-mora-prestamo'`.

**Tests**: 27 nuevos (17 en `cobranza.service.spec.ts` + 10 de contrato en
`prestamista.dto.spec.ts`). Backend: 4879 tests en verde (+27 sobre los
4852 de Etapa 2 resto). Frontend: `npx tsc --noEmit` limpio; la suite
completa de Vitest tuvo 4 fallos por timeout en
`ClienteFormModal.test.tsx`/`SelectClienteConAlta.test.tsx` —ninguno de los
dos tocado en esta sesión— que al correrlos solos (sin el resto de la
suite compitiendo por CPU) pasan 16/16; es la misma franja de tests lentos
bajo carga de máquina que ya quedó documentada en `etapa-2-resto.md` y en
`feedback_deuda_test_nc_compras_lento` (memoria del usuario).

Commits: 1 migración + entidad, 1 backend de `CobranzaService`/
`CobranzaController`/DTO, 1 frontend (`CobranzaPage`/`WhatsAppButton`/
`prestamista.api`), 1 de tests. Todo pusheado a
`origin/feat/prestamista-motor`.

No se empezó Etapa 4 (Cartera e indicadores) — `src/prestamista/dashboard/`
y `src/prestamista/reportes/` ya tienen bastante construido para esa etapa
(KPIs, 12 endpoints de reportes), queda para quien la retome.
