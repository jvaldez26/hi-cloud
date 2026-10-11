# Prestamista Etapa 5 — Contabilidad, Caja y Fiscal

**Estado: CERRADO el 2026-10-11.** Tres partes — auditoría de contabilidad
(sin huecos, sin código nuevo), integración con Caja (nueva, con interruptor
por empresa) y disparo fiscal por concepto (nuevo, inactivo hasta
configurarse). Backend y frontend, con tests y suites completas en verde,
pusheado a `origin/feat/prestamista-motor`.

---

## Parte A — Auditoría de Contabilidad

Se auditó `AsientosAutomaticosService` y cada punto de `src/prestamista/**`
que mueve dinero real, para confirmar que cada acción genera su asiento y
que cada una tiene su contra-asiento al revertir.

| Acción | Asiento | Reversa |
|---|---|---|
| Desembolso (inicial, vía `PrestamosService.crearEnTransaccion`) | `asientoDesembolsoPrestamo` | — (no se anula un desembolso) |
| Desembolso (tramo, vía `DesembolsosParcialesService.registrar`) | `asientoDesembolsoPrestamo` | — |
| Pago de cuota (`PagosService.registrar`) | `asientoPagoPrestamo` | `revertirAsiento(PRESTAMISTA, ...)` en `PagosService.anular` |
| Refinanciamiento (`RefinanciamientoService.refinanciar`) | `asientoRefinanciamiento` | — (refinanciar siempre cierra el préstamo original; no existe "deshacer un refinanciamiento") |
| Condonación independiente (`CondonacionService.condonar`) | `asientoCondonacionPrestamo` | — (condonar es una decisión final, no se revierte) |
| Reestructuración (`ReestructuracionService.reestructurar`) | Ninguno — correcto: no mueve dinero, solo cambia el plan de cuotas futuras | n/a |

**Conclusión: no se encontró ningún hueco real.** Todo lo que mueve dinero
en Prestamista ya generaba su asiento antes de esta etapa (la mayoría
construido en Etapa 2) y la única reversa que aplica (anulación de pago) ya
estaba cableada. No se tocó ningún archivo de contabilidad en esta etapa —
se confirma explícitamente para no inventar trabajo donde no hace falta.

---

## Parte B — Integración con Caja

**Pedido**: el efectivo de desembolsos y cobros de préstamos entra en el
cierre de caja del cajero — mismo cuadre por forma de pago, mismo umbral de
faltante de efectivo que ya usa el resto del ERP.

**Decisión de negocio ya cerrada** (`decisiones-pendientes.md`): por
defecto SÍ pasa por caja, con un interruptor por empresa para desactivarlo.

### Qué se tocó

- **Migración** `1781000000000-PrestamistaEtapa5CajaFiscal.ts`:
  - `pr_pagos.cajaDiariaId` (nullable, sin FK — mismo patrón que
    `gastos.cajaDiariaId`, ver `AddGastoCajaDiariaId1755200000000`).
  - `pr_desembolsos_parciales.cajaDiariaId` (idéntico).
  - `cierres_caja.cobrosPrestamoEfectivo` / `desembolsosPrestamoEfectivo`
    (decimal, default 0).
- **`src/prestamista/utils/caja-efectivo.util.ts`** (nuevo) —
  `resolverCajaDiariaPrestamo()`: única función que decide si un
  cajaDiariaId entra. Solo tiene efecto si `metodoPago === 'efectivo'`;
  valida SIEMPRE que la caja pertenezca a la empresa y esté abierta
  (fuga multi-tenant cerrada en el mismo punto donde se guarda, no solo en
  la lectura). Usada por los tres puntos que pueden mover efectivo:
  `PagosService.registrar`, `DesembolsosParcialesService.registrar`, y
  `PrestamosService.crearEnTransaccion` (el desembolso inicial SIEMPRE pasa
  por `pr_desembolsos_parciales`, incluso cuando es el 100% de una vez — no
  hay un segundo camino de "desembolso directo" que hubiera quedado fuera).
- **`efectivo-esperado.util.ts`** — dos campos nuevos, OPCIONALES, en
  `EntradasEfectivo`: `cobrosPrestamoEfectivo` (suma) y
  `desembolsosPrestamoEfectivo` (resta). Opcionales a propósito: ningún
  call site existente (ni sus tests) tuvo que tocarse — un objeto que no los
  manda sigue dando el mismo resultado que antes de esta etapa.
- **`caja.service.ts`**:
  - `getEmpresaCfg()` — nuevo campo `prestamoEfectivoPorCaja` (default
    `true`), mismo patrón que `notificarDescuadreCaja` (agregado el mismo
    día, usado literalmente como plantilla).
  - `recalcularDesdeBD()` — dos queries nuevas (`cobrosPrestamoEfectivo` desde
    `pr_pagos`, `desembolsosPrestamoEfectivo` desde `pr_desembolsos_parciales`),
    filtradas por `cajaDiariaId` + `empresaId` (defensa en profundidad) +
    `estado='activo'` para pagos. Ambas detrás del interruptor: si está
    apagado, ni siquiera se ejecutan — las columnas quedan en 0 y el cálculo
    es idéntico al de antes de esta etapa.
  - `calcularEsperadoPorForma()` — un cobro de cuota por tarjeta/transferencia
    suma a SU bucket (nunca al de efectivo), mismo patrón que
    `cobrosPorForma`/`anticiposPorForma`. Los desembolsos NO entran a
    tarjeta/transferencia: un desembolso por esos medios es una salida
    bancaria, no algo que el cajero deba cuadrar contra ningún lote/declaración.
- **Frontend**:
  - `ConfiguracionPage.tsx` — switch "Efectivo de préstamos por la caja del
    cajero" en la sección "Cierre de Caja", mismo patrón que el switch de
    `notificarDescuadreCaja` (Form.Item + Switch + texto secundario).
  - `DetallePrestamo.tsx` — selector de caja (opcional) en el modal de
    "Registrar Pago" (solo visible con forma de pago = efectivo, pago no
    mixto) y en el modal de "Registrar Tramo de Desembolso" (solo con
    forma = efectivo). Mismo patrón visual que el selector de
    `GastosPage.tsx` (`GET /caja/hoy`, `Select allowClear`).
  - `PrestamosPage.tsx` — el formulario de "Nuevo Préstamo (Desembolso)"
    NUNCA tuvo un campo de forma de pago (el DTO tampoco lo declaraba — todo
    desembolso inicial caía en "transferencia" por el fallback del asiento,
    sin que la UI pudiera cambiarlo). Se agregó "Forma del desembolso"
    (default `transferencia`, sin cambiar el comportamiento de quien no
    toque el campo) + el mismo selector de caja cuando es efectivo.

### Alcance NO cubierto (anotado, no bloquea)

- **Pago mixto con una línea en efectivo**: `cajaDiariaId` solo se acepta
  cuando el pago es de un solo método (`metodoPago === 'efectivo'`), nunca
  cuando es `'mixto'` (varias formas, `formasPago[]`). Un pago mixto que
  incluya una línea en efectivo NO entra al cuadre de caja. Razón: la
  columna `cajaDiariaId` es una sola por pago — prorratear cuál parte de un
  pago mixto es "la de efectivo" habría necesitado una columna/relación
  nueva (monto en efectivo del pago, separado del monto total) para un caso
  que, en la práctica de Prestamista, es el menos común (la mayoría de
  pagos son de un solo método). Anotado en `decisiones-pendientes.md`.

---

## Parte C — Tratamiento fiscal (e-CF/ITBIS por concepto)

**Decisión ya cerrada**: no se decide el tratamiento fiscal — se construye
la integración pero queda inactiva hasta que cada producto configure su
sección "Fiscal" (`pr_productos_prestamo.motorConfig.fiscal`, con
`generaComprobante`/`tipoEcf`/`tratamientoItbis` por concepto — ya existía
desde Fase 2B, vacía en todos los productos).

**Auditoría primero**: ya existía un circuito — `PagosService.registrar()`
emite un e-CF tipo 32 SIEMPRE que `aplicadoInteres > 0`, sin mirar ninguna
configuración (preexistente desde Etapa 2 resto §1, interés financiero
siempre exento). Se deja ese circuito intacto — no es parte de "Fiscal",
es una regla de negocio distinta y más vieja; tocarlo habría sido un
cambio de comportamiento no pedido.

**Lo que se agregó**: el mismo e-CF (mismo `documentoOrigenId` = el pago)
ahora puede llevar líneas ADICIONALES por mora y por cargos, cada una SOLO
si `motorConfig.fiscal.mora.generaComprobante`/`fiscal.gastos.generaComprobante`
es `true` en el producto de ese préstamo:

- `PagosService.registrar()` — la condición de disparo pasa de
  `aplicadoInteres > 0` a `aplicadoInteres > 0 || disparaPorMora || disparaPorCargos`,
  donde las dos nuevas son `false` mientras el producto no configure su
  "Fiscal" (hoy, en todos los productos) — el comportamiento es exactamente
  el de antes de esta etapa.
- `EmitirECFUseCase.cargarDocumentoOrigen()` (caso `PAGO_PRESTAMO`) — ahora
  construye un array de líneas: interés (igual que antes, exenta, siempre
  presente) + mora/cargos si están configuradas y el monto es > 0. El
  `tratamientoItbis` de cada concepto (`0`/`16`/`18`/`'exento'`/`null`) se
  traduce a `porcentajeIva`/`importeIva` de esa línea.

### Alcance NO cubierto (anotado, no bloquea)

- **Cargo de apertura y seguro**: los conceptos `apertura` y `seguro` de
  `CONCEPTOS_FISCALES_BASE` quedan SIN disparo — se cobran al DESEMBOLSAR
  (`cargoAperturaRetenido`, resuelto en `PrestamosService`), no al pagar una
  cuota, y el único `DocumentoOrigenTipo` que existe para Prestamista
  (`PAGO_PRESTAMO`) está construido alrededor de un `pr_pagos.id` — no hay
  forma de colgar un e-CF de un desembolso sin agregar un
  `DocumentoOrigenTipo` nuevo (ej. `DESEMBOLSO_PRESTAMO`), lo que implica
  una migración del enum `ecf.documentoOrigenTipo` que usa TODO el motor de
  e-CF del ERP (Facturas, Compras, Gastos, Notas). Se decidió no tocar ese
  enum compartido en esta etapa — el riesgo de alterarlo sin que el negocio
  haya decidido el tratamiento fiscal real de apertura/seguro no se
  justifica todavía (hoy ningún producto tiene su "Fiscal" configurada).
  Si se necesita, es un cambio acotado: nuevo valor de enum + migración +
  un resolver nuevo en `cargarDocumentoOrigen()` keyado por `prestamoId` en
  vez de `pagoId`.

---

## Hallazgo de infraestructura (no es un bug de Prestamista)

La suite completa tiene un paquete de specs de integración REAL contra
Postgres local (`127.0.0.1:5433/hicloud_test`, nunca producción — ver el
comentario en `cw-liquidaciones.service.spec.ts`). Esa base de datos NO
tenía `migrations` como tabla de control (nunca se le corrió el CLI de
TypeORM) y le faltaban columnas/tablas de migraciones de Prestamista
bastante anteriores a esta etapa (`pr_pagos.estado`/columnas de anulación
de Etapa 2 resto §1, y la tabla `pr_desembolsos_parciales` completa de
Etapa 2 resto §4). Como `CajaService.recalcularDesdeBD()` ahora consulta
`pr_pagos`/`pr_desembolsos_parciales` siempre que hay `empresaId` (si el
interruptor está encendido), un error de "relación no existe" dentro de una
transacción Postgres la deja abortada para el resto de las queries de esa
transacción — aunque el código tenga su propio `.catch()`, Postgres ya
rechazó todo lo que viene después hasta el `ROLLBACK`. Esto rompía
`cw-liquidaciones.service.spec.ts` (car-wash, nada que ver con Prestamista)
porque también usa `CajaService` real.

Se puso al día esa base de datos LOCAL de pruebas con las columnas/tabla
que le faltaban (mismo DDL que las migraciones ya commiteadas) — no se
tocó ninguna migración existente, no se tocó producción. Queda anotado
porque es una señal de que esa base de datos de integración lleva tiempo
sin recibir todas las migraciones de Prestamista; alguien debería
corrérsela por completo (`npm run migration:run` contra
`127.0.0.1:5433/hicloud_test`) en algún momento, no es urgente porque ya
quedó al día para lo que esta etapa necesitaba.

---

## Tests

- **Backend** (Jest): `caja-efectivo.util.spec.ts` (8, nuevo),
  `pagos-caja-fiscal.spec.ts` (8, nuevo — caja + disparo fiscal),
  `emitir-ecf-pago-prestamo.spec.ts` (5, nuevo — líneas fiscales por
  concepto), ampliaciones a `efectivo-esperado.util.spec.ts` (+4),
  `caja.service.spec.ts` (+3, describe nuevo "efectivo de préstamos por
  caja"), `desembolsos-parciales.service.spec.ts` (+3),
  `desembolso-transaccional.spec.ts` (+3, describe nuevo "integración con
  Caja"). Total 34 tests nuevos. Suite completa: **328/328 suites, 4935
  tests en verde** (131 skipped — integración real que se salta sin
  Postgres/credenciales locales, igual que siempre).
- **Frontend** (Vitest): `PrestamosPage.test.tsx` (2, nuevo — selector de
  caja en "Nuevo Préstamo"); `DetallePrestamo.*` y `ConfiguracionPage.tsx`
  no necesitaron tests nuevos propios para esta etapa aparte de los ya
  existentes, que siguen en verde sin cambios (confirmado al correr la
  suite completa). Suite completa: **79/79 archivos, 673 + 2 nuevos en
  verde**.
- Typecheck limpio (`npx tsc --noEmit`) en ambos lados.

## Resumen final

- Parte A (contabilidad): auditada, sin huecos, sin código nuevo.
- Parte B (caja): integrada con interruptor por empresa (default ON),
  multi-tenant validado en el punto de guardado, fórmula de efectivo
  esperado extendida de forma retrocompatible (campos opcionales).
- Parte C (fiscal): el circuito preexistente de interés queda intacto;
  mora/cargos quedan integrados pero inactivos hasta que un producto
  configure su "Fiscal"; apertura/seguro quedan fuera (anotados, requieren
  tocar un enum compartido por todo el ERP).
- Decisión nueva anotada en `decisiones-pendientes.md`: pago mixto con una
  línea en efectivo no entra al cuadre de caja.
- Todo pusheado a `origin/feat/prestamista-motor`. Etapa 6 (Seguridad) NO
  se empezó — queda para la próxima sesión.
