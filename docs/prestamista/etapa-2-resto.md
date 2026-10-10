# Prestamista Etapa 2 (resto) — nota de diseño

**Estado:** diseño cerrado el 2026-10-10, implementación en curso.

El "Motor Financiero" (Fase 2A/2B, ver `motor-financiero.md`) ya estaba completo
e integrado antes de este documento — era infraestructura de cálculo, no las
features de negocio de la Etapa 2 original. Este documento cubre lo que
seguía pendiente de la lista original: **anulación de pagos con reversa,
garantes con ciclo de vida, ciclo de vida de garantías, desembolsos
parciales, reestructuración, condonación independiente, y contratos/pagarés
en PDF.**

Cada decisión sin un default ya dado por Jean queda anotada aquí con el valor
elegido y el porqué — no bloquea la implementación, son los valores de
arranque (igual criterio que `decisiones-pendientes.md`).

---

## 1. Anulación de pagos con reversa

Default YA dado (`decisiones-pendientes.md`): solo ADMIN, motivo obligatorio,
autorización de supervisor **siempre** (clave nueva `anular_pago_prestamo`,
`RequiereSupervisorSiempre` — sin bypass por rol, igual mecanismo que
`corregir_forma_pago_factura` de Caja).

**[DECISIÓN]** Solo se puede anular el pago **más reciente no anulado** de
ese préstamo (orden LIFO). Para anular uno más viejo hay que anular los
posteriores primero, en orden. Razón: `PagosService.registrar()` aplica cada
pago sobre el saldo que dejó el anterior — anular uno de en medio sin anular
los que vinieron después dejaría cuotas con montos que no corresponden a
ningún estado real del préstamo.

**[DECISIÓN]** Un pago que incluyó un **abono extraordinario**
(`montoExtraCapital > 0`) **no se puede anular automáticamente** —
`aplicarAbonoExtraordinario()` borra y recalcula la tabla de cuotas futuras
con el motor v2; reconstruir la tabla ANTERIOR a ese recálculo no es una
operación inversa simple (depende de qué otros pagos cayeran sobre esas
cuotas después). Se rechaza con mensaje explícito pidiendo contactar soporte.
Cubre la mayoría de pagos reales (cuotas/abono simple) — el abono
extraordinario es el caso menos frecuente y el único con acompañamiento manual
por ahora.

**[DECISIÓN]** Si el pago generó un e-CF tipo 32 por interés
(`DocumentoOrigenTipo.PAGO_PRESTAMO`) y ese e-CF ya está **ACEPTADO** por
DGII, la anulación se rechaza — un e-CF aceptado no se borra, se corrige vía
Nota de Crédito al 607 (fuera del alcance de este cambio). Si el e-CF está en
`pendiente_envio`/`rechazado`/`borrador` (nunca llegó a ser aceptado), se
marca `isActive = false` junto con la anulación del pago.

Reversa, dentro de una transacción con `FOR UPDATE`:
1. Revertir cada línea de `cuotasAfectadas` sobre `pr_cuotas` (restar
   interés/capital/mora/cargos pagados; `estado` vuelve a `pendiente` si todo
   queda en 0, a `parcial` si queda algo).
2. Recalcular saldos del préstamo — misma query de suma que `registrar()`.
3. Revertir `pr_deudores.totalPagado` (y `prestamosActivos++` si el préstamo
   había quedado `pagado` y vuelve a tener saldo).
4. `AsientosAutomaticosService.revertirAsiento(PRESTAMISTA, pago.id, hoy,
   motivo, pago.numero)` — contra-asiento nuevo, el original nunca se toca
   (mismo patrón que el resto del ERP).
5. Cancelar el e-CF si aplica (punto anterior).
6. Marcar el pago: `estado='anulado'`, `anuladoPor`, `anuladoPorNombre`,
   `anuladoEn`, `motivoAnulacion`.

Columnas nuevas en `pr_pagos`: `estado` (`'activo'|'anulado'`, default
`'activo'`), `anuladoPor`, `anuladoPorNombre`, `anuladoEn`, `motivoAnulacion`.

---

## 2. Garantes (avales personales) — ciclo de vida

La entidad `PrGarante` existe sin servicio ni controller — es una tabla sin
API. Se agrega CRUD + ciclo de vida.

**[DECISIÓN]** Estados: `activo` | `liberado`. **Nunca se libera
automáticamente** al pagarse el préstamo — un garante sigue respaldando
hasta que un ADMIN lo libera a mano con motivo (`PATCH .../liberar`). Razón:
liberar una garantía personal es una decisión de negocio (el deudor puede
tener OTROS préstamos activos que el mismo garante respalda, o la empresa
puede querer conservar el respaldo por un período de gracia tras el último
pago) — automatizarlo sin que nadie lo confirme es más riesgoso que pedir un
clic.

Endpoints: `GET` por préstamo/deudor/uno, `POST` crear, `PATCH` editar datos,
`PATCH .../liberar` (motivo obligatorio, requiere `RequiereSupervisor`
— no `Siempre`, es una acción de ADMIN/CONTADOR igual que el resto del
catálogo, no mueve dinero).

---

## 3. Garantías (colateral) — ciclo de vida

Ya existe CRUD básico con un campo `estado` libre (default `'activa'`). Se
agregan acciones dedicadas en vez de dejarlo como texto libre por PATCH:

**[DECISIÓN]** Estados cerrados: `activa` | `liberada` | `ejecutada`.
- `liberar` (motivo opcional — caso normal, el préstamo se pagó): pasa a
  `liberada`.
- `ejecutar` (motivo **obligatorio**, requiere `RequiereSupervisorSiempre`
  — es la acción más grave del módulo, el banco se queda con el bien): pasa
  a `ejecutada`, registra `fechaEjecucion`.
Igual que los garantes, nunca automático.

Nueva clave de catálogo: `ejecutar_garantia`.

---

## 4. Desembolsos parciales

**[DECISIÓN]** La tabla de amortización se sigue generando COMPLETA al crear
el préstamo (sobre el monto total) — el deudor empieza a deber y a pagar
cuotas desde el inicio, como hoy. Lo que cambia es que el **efectivo** del
desembolso puede entregarse en tramos: se agrega una tabla
`pr_desembolsos_parciales` (`prestamoId`, `monto`, `fecha`, `metodoPago`,
`notas`) y el préstamo nace con `desembolsado = 0`; cada tramo que se
registra suma a `desembolsado` hasta llegar al monto total. El asiento
contable de desembolso (ya existente) se genera POR TRAMO, no una vez por el
total.

Razón del default: reescribir la tabla de amortización cada vez que entra un
tramo (como si fuera un abono extraordinario a la inversa) complicaría la
relación entre "cuánto debo" y "cuánto me han dado" de forma que el deudor no
esperaría — lo habitual en la práctica dominicana es que el deudor firma por
el monto completo y empieza a pagar cuotas aunque el dinero llegue en partes
(construcción, línea de crédito agrícola, etc.).

**[DECISIÓN]** No se puede operar el préstamo (pagos, refinanciamiento) hasta
que `desembolsado = montoPrincipal` — un préstamo con desembolso pendiente
queda en estado nuevo `desembolso_parcial`, visible en el listado, y
`PagosService` rechaza pagos sobre él con mensaje explícito.

---

## 5. Reestructuración (independiente de refinanciar)

`RefinanciamientoService.refinanciar()` SIEMPRE cierra el préstamo y crea uno
nuevo. Reestructurar es distinto: cambiar plazo/tasa/método de un préstamo
que sigue siendo el MISMO (mismo id, mismo historial de pagos).

**[DECISIÓN]** Solo se puede reestructurar sobre el **saldo de capital
actual** (no el principal original) y solo afecta las cuotas **totalmente
pendientes** (ningún pago parcial) — exactamente el mismo criterio que ya usa
`aplicarAbonoExtraordinario()` para no tocar el historial ya pagado. Se
recalcula con el motor v2 (nuevos plazo/tasa/método/gracia si se piden) sobre
ese saldo, y las cuotas totalmente pendientes se reemplazan.

Requiere `RequiereSupervisorSiempre('reestructurar_prestamo')` + motivo
obligatorio (cambia lo que el deudor va a pagar; no es una operación de rutina
como un abono). No genera asiento contable propio (no mueve dinero, solo
cambia el plan futuro) — a diferencia de refinanciar, que sí mueve el saldo a
un préstamo nuevo.

---

## 6. Condonación independiente

Hoy solo existe empaquetada dentro de `refinanciar()`. Se agrega como acción
propia sobre un préstamo VIVO, sin refinanciarlo.

**[DECISIÓN]** Solo puede condonarse **mora** y/o **interés pendiente** (no
capital — condonar capital es, en la práctica, perdonar parte de la deuda
real, y el pedido no lo cubre; se deja fuera a propósito). Requiere
`RequiereSupervisorSiempre('condonar_prestamo')` + motivo obligatorio.
Reduce `moraGenerada`/`interes` de las cuotas pendientes (prorrateado o desde
la más vieja, igual orden que los pagos) y genera un asiento de "Gasto por
condonación" (cuenta ya resuelta en refinanciar, se reutiliza
`PRESTAMO_CONDONACION` / el concepto que ya usa `asientoRefinanciamiento`).

---

## 7. Contratos y pagarés en PDF

`PrestamistaPdfService` no genera ningún documento legal. Se agregan dos
plantillas nuevas, reusando los datos ya disponibles (préstamo, deudor,
garantías, garantes, tabla de amortización):

- **Contrato de préstamo**: partes (empresa/deudor), monto, tasa, plazo,
  método de amortización, garantías/garantes listados, firma.
- **Pagaré**: monto, fecha de vencimiento (última cuota), firma — el
  documento simple que respalda el cobro si hace falta ejecutar.

**[DECISIÓN]** Son plantillas de texto simples (sin cláusulas legales
redactadas por un abogado) — un marcador de posición para que la empresa
pueda imprimir algo firmable desde ya; el texto legal completo queda fuera de
alcance de este cambio y se anota como deuda si se necesita después.

---

## Resumen de decisiones nuevas (no cubiertas por Jean, default aplicado)

| # | Decisión | Resuelto como |
|---|---|---|
| 1 | Qué pago se puede anular | Solo el más reciente no anulado (LIFO) |
| 1 | Pago con abono extraordinario | No se puede anular automáticamente — rechazado con mensaje |
| 1 | Pago con e-CF ya ACEPTADO | No se puede anular — corregir vía NC al 607 |
| 2 | Liberar garante al pagar | Nunca automático — ADMIN libera a mano |
| 3 | Estados de garantía | activa / liberada / ejecutada, ejecutar requiere SupervisorSiempre |
| 4 | Tabla de amortización con desembolso en tramos | Se genera completa desde el inicio; el efectivo entra en tramos |
| 4 | Operar préstamo con desembolso incompleto | Bloqueado hasta completar |
| 5 | Qué puede tocar una reestructuración | Solo saldo actual + cuotas totalmente pendientes, igual que abono extraordinario |
| 6 | Qué se puede condonar | Mora e interés, nunca capital |
| 7 | Nivel legal de contrato/pagaré | Plantilla simple, no redacción legal completa |
