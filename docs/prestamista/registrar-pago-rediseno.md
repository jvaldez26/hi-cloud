# Rediseño de "Registrar Pago" (precursor de Etapa 2)

Pieza pedida antes de arrancar las 7 etapas. Reutiliza infraestructura ya
existente en el ERP en vez de reinventarla (investigado antes de escribir
código): Modo Supervisor del POS (`RequiereSupervisor`), envío de correo con
adjunto (`EmailService`, patrón de `FacturaEmailService`) y el link de
WhatsApp (`WhatsAppButton` + `comunicaciones.controller.ts`).

## Tipos de pago

Un solo endpoint (`POST /prestamista/pagos`), un campo `tipoPago`:

- **`cuotas`** (por defecto) — paga las `cuotasSeleccionadas` (ids de
  `pr_cuotas`), en orden estricto desde la más vieja. El servidor rechaza una
  selección que salte una cuota pendiente anterior — nunca confía en el orden
  que mande el frontend.
- **`abono_parcial`** — monto libre, se aplica a la cuota pendiente más vieja
  (mismo orden mora→interés→capital→cargos de siempre), sin exigir que cubra
  la cuota completa.
- **`abono_extraordinario_capital`** — además de dejar al día las cuotas
  seleccionadas (si las hay), el resto del monto se aplica directo a capital
  y se recalcula la tabla de cuotas **restantes no pagadas** con el motor v2,
  misma tasa/frecuencia/método que el préstamo ya tiene. `opcion`:
  - `reducir_cuota`: mismo plazo restante, cuota más baja (una llamada directa
    a `calcularTablaAmortizacion`).
  - `reducir_plazo`: misma cuota (o menor), menos períodos — búsqueda lineal
    sobre N (plazo restante es siempre un número chico) probando
    `calcularTablaAmortizacion` hasta encontrar el N más pequeño cuya cuota no
    supere la actual. Sin fórmula inversa nueva: el motor sigue siendo la
    única fuente de verdad.
  - Las cuotas ya pagadas/parciales NO se tocan — solo se reemplazan las que
    seguían 100% pendientes.
- **`liquidar`** — paga el saldo total exacto a la fecha del pago: capital +
  interés pendiente de TODAS las cuotas + mora recalculada a esa fecha +
  cargos pendientes. Dentro de una tolerancia de RD$0.01 — nunca exige que el
  cajero adivine el centavo exacto.

## Excedente

Si el monto cubre las cuotas/selección y sobra dinero: por defecto se aplica
a las **siguientes cuotas pendientes**, en el mismo orden de siempre. Nuevo
campo `motorConfig.excedentePago.destino` (`'siguientes_cuotas'` | `'capital'`)
configurable por producto — ver decisión pendiente en
`docs/prestamista/decisiones-pendientes.md`. Si el monto excede el saldo
total del préstamo, el backend lo rechaza y sugiere `tipoPago: 'liquidar'`.

## Fecha retroactiva y mora a esa fecha

`fecha` es opcional (hoy por defecto). Si es anterior a hoy:
- La mora de cada cuota pendiente se **recalcula a esa fecha** (días de atraso
  = fecha de pago − vencimiento, nunca "hoy") en vez de usar
  `moraGenerada` (que el cron ya avanzó a hoy) — mismas funciones puras
  (`calcularMoraCuota`/`calcularMora` v2) que usa `mora.cron.ts`, nunca una
  fórmula nueva.
- Requiere autorización de supervisor: nueva clave `pago_retroactivo` en el
  catálogo (`RequiereSupervisor('pago_retroactivo', { soloSi: fecha anterior })`).
  Por diseño del guard existente, esto solo afecta a rol `vendedor` — ADMIN/
  CONTADOR pasan siempre, igual que el resto de las políticas del POS.

## Vista previa

`POST /prestamista/pagos/preview` — mismo body, mismo cálculo exacto que
`registrar()` (comparten `pagos-calculo.util.ts`), pero no persiste nada:
sin transacción, sin bloqueo de filas. Devuelve la distribución por cuota,
cuántas quedan pagadas y los saldos después del pago.

## Forma de pago

`formasPago: { metodo, monto, referencia? }[]` — una o varias (mixto). Si
`metodo` no es `efectivo`, `referencia` es obligatoria (validado en el DTO).
En efectivo, `montoRecibido` opcional calcula el cambio en el frontend
(no es dinero real del sistema, no se persiste).

## Recibo: imprimir, correo, WhatsApp

- Imprimir: ya existe (`GET /prestamista/pdf/recibo/:id`).
- Correo: `prestamista-pdf.service.ts` se factoriza para devolver el PDF como
  buffer (sin tocar el endpoint HTTP existente) y un nuevo
  `POST /prestamista/pagos/:id/enviar-recibo` lo adjunta vía `EmailService`
  (mismo patrón que `FacturaEmailService`), con el modal `EmailConCopiaModal`
  ya existente en el frontend.
- WhatsApp: `WhatsAppButton` gana el tipo `'recibo-prestamo'` y
  `comunicaciones.controller.ts` un endpoint que arma el link `wa.me` —
  no hay proveedor de WhatsApp Business activado en este ERP (confirmado:
  `notificaciones/services/whatsapp.service.ts` solo simula si no hay
  `WHATSAPP_API_URL`/`WHATSAPP_TOKEN`), así que por ahora es el mismo
  mecanismo manual que ya usa el resto del sistema, no un envío automático.

## Idempotencia y bloqueo

Sin cambios de fondo: `claveIdempotencia` se sigue generando al abrir el
modal, `FOR UPDATE` sobre las cuotas pendientes sigue siendo la misma
transacción. `preview()` nunca abre transacción ni bloquea nada — es de solo
lectura.

## Qué NO entra aquí (es Etapa 2)

Anular un pago ya registrado con reversa completa — el pedido lo agrupa
explícitamente en la Etapa 2 ("anulación de pagos con reversa completa"), así
que esta pieza no la construye. `registrar_pago` sigue sin exigir supervisor
por sí solo (solo `pago_retroactivo`, condicional a la fecha).

## Resumen (cerrado 2026-10-09)

**Qué quedó:**
- Backend: `pagos-calculo.util.ts` (puro, testeado), `prepararOperacion()`
  compartido entre `preview()`/`registrar()`, los 4 tipos de pago,
  `aplicarAbonoExtraordinario()` (recalcula la tabla restante con el motor
  v2, probado de punta a punta), mora recalculada a una fecha retroactiva,
  supervisor (`pago_retroactivo`), recibo por correo y link de WhatsApp.
- DB: migración `1773000000000-RegistrarPagoRediseno` aplicada en local.
- Frontend: modal de "Registrar Pago" rediseñado por completo en
  `DetallePrestamo.tsx`, con vista previa en vivo.
- 285 tests en `src/prestamista` en verde (10 nuevos puros + 6 de contrato +
  5 e2e contra servicios reales), `tsc --noEmit` limpio en los dos lados.

**Qué probar (local, antes de seguir con Etapa 1):**
1. Pagar cuotas seleccionadas en orden (y confirmar que selecciona en orden
   desde la más vieja, no deja saltar ninguna).
2. Abono parcial — menor al pendiente de la cuota más vieja.
3. Liquidar préstamo — confirmar que el monto se auto-llena desde la vista
   previa, no hay que calcularlo a mano.
4. Abono extraordinario a capital, las dos opciones (reducir cuota / reducir
   plazo) — revisar la tabla de cuotas después, que la recalculada tenga
   sentido.
5. Un pago con fecha de ayer con un usuario rol VENDEDOR — debe pedir
   supervisor. Con ADMIN/CONTADOR no debería pedir nada (ver decisión
   pendiente abajo).
6. Imprimir, WhatsApp y correo del recibo recién creado.

**Decisiones tomadas** — ver `docs/prestamista/decisiones-pendientes.md` para
el detalle completo y los defaults usados: excedente del pago (default
`siguientes_cuotas`, configurable por producto) y alcance de
`pago_retroactivo` (solo vendedor, por diseño del guard existente).
