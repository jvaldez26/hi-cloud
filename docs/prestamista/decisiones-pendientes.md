# Decisiones de negocio pendientes de confirmar

Donde hubo una decisión de negocio sin especificar, se implementó con un
valor por defecto, configurable, y queda anotado aquí para que Jean lo
confirme o lo cambie. Nada de esto bloquea el uso del módulo — son los
valores de arranque.

## Registrar Pago (precursor de Etapa 2)

- **Excedente de un pago mayor a las cuotas seleccionadas**: por defecto se
  aplica a las **siguientes cuotas pendientes** (`motorConfig.excedentePago.destino
  = 'siguientes_cuotas'`). Alternativa: `'capital'` (abono extraordinario
  automático). Configurable por producto — campo nuevo en el formulario de
  Productos de Préstamo. Productos ya creados sin este campo heredan el
  default.
- **Pago con fecha anterior**: requiere autorización de supervisor
  (clave `pago_retroactivo` en el catálogo del Modo Supervisor). Por el
  diseño del guard que ya usa el resto del ERP, esto solo le aplica a rol
  `vendedor` — ADMIN/CONTADOR no necesitan autorización. Confirmar si ese
  alcance es el deseado para Prestamista específicamente, o si debería
  exigirse también a CONTADOR.

## Pendientes de etapas futuras (quedan anotados, no implementados aún)

- **Efectivo de préstamos por la caja del cajero**: Etapa 5. Default
  propuesto: SÍ pasa por caja (afecta el cierre de caja del turno), con un
  interruptor por empresa para desactivarlo.
- **Etapa 2 (resto) completa — §1 a §7**: **CERRADA el 2026-10-10**, ver
  `etapa-2-resto.md` (encabezado "Estado" + "Resumen (cerrado 2026-10-10)"
  al final). Backend y frontend de las 7 piezas, con tests y suites en
  verde, pusheado a `origin/feat/prestamista-motor`.
- **Frontend de §1-3 (2026-10-10)**: agregado en `DetallePrestamo.tsx` —
  botón "Anular" en Pagos, tab nueva "Garantes" (CRUD + liberar) y acciones
  Liberar/Ejecutar en la tab Garantías. No se tocó el backend.
  **[HALLAZGO]** `etapa-2-resto.md` §2 dice que liberar un garante requiere
  `RequiereSupervisor` (no Siempre) y motivo obligatorio — el código real
  (`GarantesController.liberar`, `LiberarGaranteDto`) no tiene ningún guard
  de supervisor y el motivo es opcional. Se dejó el frontend consistente con
  el código real (motivo opcional, sin paso de autorización) en vez de con el
  documento, para no inventar una regla de autorización que el backend no
  exige — si Jean confirma que sí debería exigirla, es un cambio de una
  línea en el controller (agregar `@UseGuards(RequiereSupervisor('liberar_garante'))`
  + la clave nueva en `supervisor-catalogo.ts`) más volver `motivo` obligatorio
  en el DTO.
- **Detalles no cubiertos por el diseño de §4-§7, resueltos con un default
  al implementar (2026-10-10)**:
  - §4: el cargo de apertura retenido (`cargoAperturaRetenido`) se sigue
    descontando siempre del PRIMER tramo entregado, igual que antes de este
    cambio. Si ese primer tramo fuera menor al cargo financiado, el asiento
    quedaría con un haber negativo — no se valida ese caso (ningún producto
    real tiene un cargo de apertura mayor al primer desembolso esperado).
  - §5: roles permitidos ADMIN+CONTADOR (igual nivel que editar
    garantías/garantes) — el documento no lo especificaba. `RequiereSupervisorSiempre`
    exige igual la autorización de otra persona, sin importar el rol.
  - §6: solo ADMIN (perdonar deuda es más grave que reestructurar) +
    `RequiereSupervisorSiempre`.
  - §4/§5/§6: un préstamo en `desembolso_parcial` queda bloqueado también
    para reestructurar/condonar (el documento solo mencionaba pagos y
    refinanciamiento) — mismo criterio de "no operar hasta completar el
    desembolso".
  - §6: si se pide condonar más de lo pendiente, se cubre hasta el máximo
    disponible y se informa en la respuesta (`moraSolicitadaNoAplicada`/
    `interesSolicitadoNoAplicado`) en vez de rechazar la operación completa.
- **Tratamiento fiscal (e-CF/ITBIS por concepto)**: Etapa 5. Por instrucción
  explícita, NO se decide — se construye la integración pero queda
  desactivada hasta que se configure cada concepto en Productos de Préstamo
  (sección "Fiscal", ya existe en el formulario desde la Fase 2B, hoy vacía
  a propósito).
- **Etapa 3 — Cobranza completa — CERRADA el 2026-10-11**, ver
  `etapa-3-cobranza.md`. Backend y frontend, con tests y suite en verde,
  pusheado a `origin/feat/prestamista-motor`.

## Etapa 3 — Cobranza (2026-10-11)

- **Umbrales de escalamiento por días de mora**: el pedido dio 5/15/30
  días (recordatorio/telefónica/carta); se agregó un cuarto escalón a los
  60 días (acción legal), mismo orden de magnitud que el umbral `moroso`→
  `vencido` de `MoraCronService`. Quedaron **hardcodeados en
  `CobranzaService`, iguales para todas las empresas** — ninguna
  financiera puede ajustarlos todavía. Si alguna necesita umbrales propios
  (ej. más agresiva o más laxa que el default), haría falta un campo de
  configuración por empresa — no construido, es puramente informativo hoy
  (una Tag en la UI) así que no bloquea nada mientras tanto.
- **Reasignación de cartera**: solo préstamo por préstamo
  (`PATCH prestamo/:id/cobrador`). No hay un endpoint de "mover TODA la
  cartera del cobrador X al cobrador Y de un golpe" (útil cuando alguien
  deja el puesto) — si se necesita, hoy habría que reasignar uno por uno
  desde la UI.
- **WhatsApp de cobranza por API real (WhatsApp Business)**: se mantuvo el
  mecanismo manual de link `wa.me` (igual que el resto del ERP) en vez de
  integrar `WhatsAppService` (Notificaciones) porque **ningún tenant tiene
  un proveedor de WhatsApp Business configurado hoy** — construir sobre
  esa base habría hecho parecer que el envío es automático cuando en
  realidad solo quedaría logueado en el servidor. Si algún tenant activa
  un proveedor (Meta Cloud/Twilio/360dialog/Ultramsg), cambiar el botón de
  cobranza a enviar de verdad es un cambio acotado a
  `CobranzaService.linkWhatsappMora()` + `WhatsAppService.enviarMensaje()`.
