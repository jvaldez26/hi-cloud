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

- **Efectivo de préstamos por la caja del cajero — CERRADO el 2026-10-11**,
  ver `etapa-5-contabilidad-caja-fiscal.md`. Implementado tal cual el
  default propuesto: SÍ pasa por caja, interruptor por empresa
  (`configuracion.prestamoEfectivoPorCaja`, default `true`).
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
- **Tratamiento fiscal (e-CF/ITBIS por concepto) — CERRADO el 2026-10-11**,
  ver `etapa-5-contabilidad-caja-fiscal.md`. El circuito preexistente de
  interés (tipo 32, siempre exento) queda intacto; mora y cargos ahora
  pueden agregar su propia línea al mismo e-CF, pero solo si el producto
  configuró `generaComprobante=true` para ese concepto — mientras "Fiscal"
  siga vacía (hoy, en todos los productos), nada cambia. Apertura y seguro
  quedan SIN integrar (anotado abajo, en "Etapa 5").
- **Etapa 3 — Cobranza completa — CERRADA el 2026-10-11**, ver
  `etapa-3-cobranza.md`. Backend y frontend, con tests y suite en verde,
  pusheado a `origin/feat/prestamista-motor`.
- **Etapa 4 — Cartera e indicadores — CERRADA el 2026-10-11**, ver
  `etapa-4-cartera-indicadores.md`. Auditoría encontró y corrigió una fuga
  multi-tenant real (3 JOIN sin filtro de empresa) y un cálculo de índice
  de morosidad inconsistente con el de Cobranza; backend y frontend con
  tests y suite en verde, pusheado a `origin/feat/prestamista-motor`.

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

## Etapa 5 — Contabilidad, Caja y Fiscal (2026-10-11)

- **Auditoría de contabilidad**: sin huecos — ver
  `etapa-5-contabilidad-caja-fiscal.md` Parte A. Ningún código nuevo en
  `AsientosAutomaticosService` ni en los servicios de Prestamista.
- **Pago mixto con una línea en efectivo**: `cajaDiariaId` solo se acepta
  en pagos de un solo método (`metodoPago='efectivo'`), nunca en un pago
  `'mixto'` (varias formas) aunque una de sus líneas sea efectivo. Prorratear
  cuál parte de un pago mixto es "la de efectivo" habría necesitado una
  columna nueva (monto en efectivo del pago, separado del total) para el
  caso menos común de Prestamista. Si se necesita, es un cambio acotado en
  `PagosService.registrar()` + `resolverCajaDiariaPrestamo()`.
- **Fiscal — apertura y seguro sin integrar**: los conceptos `apertura` y
  `seguro` de `CONCEPTOS_FISCALES_BASE` (motor-adaptador.util.ts) no tienen
  ningún disparo de e-CF, a diferencia de `interes`/`mora`/`gastos` (todos
  ligados a un pago vía `DocumentoOrigenTipo.PAGO_PRESTAMO`). El cargo de
  apertura se cobra al DESEMBOLSAR, no hay un `DocumentoOrigenTipo` para
  desembolsos, y agregar uno implica migrar el enum `ecf.documentoOrigenTipo`
  que comparte TODO el motor de e-CF del ERP — no se tocó ese enum sin que
  el negocio haya decidido el tratamiento fiscal real de apertura/seguro.
  Si se necesita: nuevo valor de enum (ej. `DESEMBOLSO_PRESTAMO`) + migración
  + un resolver nuevo en `EmitirECFUseCase.cargarDocumentoOrigen()` keyado
  por `prestamoId`/`desembolsoId` en vez de `pagoId`.
- **`PrestamosPage.test.tsx` se une a la franja de tests lentos bajo carga**:
  sus 2 tests pasan limpio en ~37s corridos solos, pero bajo la suite
  completa de Vitest pueden exceder hasta su timeout individual ya subido
  a 60s (mismo patrón que `NotasCreditoComprasPage`/`ClienteFormModal`/
  `SelectClienteConAlta`, dos Selects antd encadenados dentro de un Modal).
  No se intentó resolver la causa raíz (contención de recursos del runner
  de Vitest bajo carga) — queda en la misma categoría de deuda aceptada.
- **Base de datos local de integración desactualizada**: la BD de pruebas
  de integración real (`127.0.0.1:5433/hicloud_test`, nunca producción —
  usada por specs como `cw-liquidaciones.service.spec.ts`) no tenía ninguna
  migración de Prestamista posterior a la creación de `pr_pagos` (le
  faltaban `pr_pagos.estado`/columnas de anulación de Etapa 2 resto §1, y la
  tabla `pr_desembolsos_parciales` entera de Etapa 2 resto §4) ni una tabla
  `migrations` de control — sugiere que nunca se le corrió el CLI de
  TypeORM. Se puso al día con el DDL exacto de esas migraciones (más las
  columnas nuevas de esta etapa) para que `cw-liquidaciones.service.spec.ts`
  siguiera pasando — ver el detalle en `etapa-5-contabilidad-caja-fiscal.md`.
  Pendiente: alguien debería correrle el historial completo de migraciones
  en algún momento (`npm run migration:run` contra esa BD), no es urgente.
