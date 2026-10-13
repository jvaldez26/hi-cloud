# Prestamista — resumen del módulo (Etapas 1-7, roadmap cerrado)

Puerta de entrada para quien necesite entender qué hay en
`feat/prestamista-motor` sin leer los 7 documentos de etapa uno por uno.
Prestamista es el módulo de HiCloud ERP para financieras/prestamistas que
otorgan préstamos a plazo con interés: simulación, desembolso, cobro de
cuotas (capital/interés/mora/cargos), cobranza de mora, refinanciamiento/
reestructuración/condonación, garantías/garantes, contabilidad/caja/fiscal
integrados, seguridad multi-tenant auditada, y ahora un score crediticio
del deudor. **Nunca automatiza una decisión de negocio sin que un humano
la confirme** — ni aprobar un préstamo, ni condonar deuda, ni ejecutar una
garantía, ni (ahora) el score: todo es una señal para que alguien decida,
nunca un bloqueo ni una acción automática.

## Qué hace el módulo hoy

- **Simulación y solicitud**: comparar escenarios de crédito (monto,
  plazo, tasa, frecuencia, método francés/alemán), guardar/recuperar/
  convertir en solicitud, decidir aprobar/rechazar.
- **Motor de préstamos v2**: amortización con frecuencias (diaria a
  anual), períodos de gracia, cargos por cuota, feriados, desembolso en
  tramos (parcial).
- **Cobro**: registrar pagos (cuotas, abono extraordinario, liquidar),
  mixtos por varias formas de pago, recibo por correo, anulación con
  reversa completa (nunca se borra un pago).
- **Alivio de deuda**: refinanciamiento (cierra el préstamo y abre uno
  nuevo), reestructuración (mismo préstamo, nuevo plan de cuotas),
  condonación independiente de mora/interés (nunca capital) — las tres
  con autorización de supervisor.
- **Garantías y garantes**: ciclo de vida completo (activa/liberada/
  ejecutada para garantías; activo/liberado para garantes), nunca se
  liberan solos al pagarse el préstamo.
- **Cobranza**: cartera vencida con escalamiento sugerido por días de
  mora, gestiones, promesas de pago e incumplimiento, reasignación de
  cartera, notificación por email/WhatsApp (manual).
- **Cartera e indicadores**: Dashboard (KPIs, distribución de mora, top
  deudores) y 12 reportes CSV exportables.
- **Contabilidad, caja y fiscal**: asientos automáticos ya existentes sin
  huecos; el efectivo de préstamos pasa por la caja del cajero (interruptor
  por empresa); interés/mora/cargos pueden emitir e-CF por producto.
- **Seguridad**: multi-tenant auditado en los 3 módulos de alivio de deuda
  y en cartera/reportes; autorización dual obligatoria en condonación/
  refinanciamiento/ejecución de garantía.
- **Scoring e inteligencia** (esta etapa): score crediticio del deudor
  (motor de reglas, nunca ML) y una alerta de cambio de patrón de pago.

## Etapas

| Etapa | Qué construyó | Doc |
|---|---|---|
| 1 | Simulador: comparador de escenarios, PDF, guardar/recuperar/duplicar, convertir en solicitud. | [etapa-1.md](./etapa-1.md) |
| 2 | Motor completo: préstamos v2 (amortización avanzada), registrar pago rediseñado, y el "resto" (§1-§7): anulación de pagos con reversa, ciclo de vida de garantes/garantías, desembolso parcial, reestructuración, condonación independiente, contrato/pagaré. | [motor-financiero.md](./motor-financiero.md), [registrar-pago-rediseno.md](./registrar-pago-rediseno.md), [etapa-2-resto.md](./etapa-2-resto.md) |
| 3 | Cobranza: cartera vencida con escalamiento, gestiones, promesas de pago, reasignación de cartera, notificación manual por email/WhatsApp. | [etapa-3-cobranza.md](./etapa-3-cobranza.md) |
| 4 | Cartera e indicadores: auditoría que encontró y corrigió una fuga multi-tenant real (3 JOIN sin filtro de empresa) y un índice de morosidad inconsistente entre Reportes y Cobranza. | [etapa-4-cartera-indicadores.md](./etapa-4-cartera-indicadores.md) |
| 5 | Contabilidad, caja y fiscal: caja del cajero integrada (interruptor por empresa), e-CF de mora/cargos por producto; contabilidad auditada sin huecos. | [etapa-5-contabilidad-caja-fiscal.md](./etapa-5-contabilidad-caja-fiscal.md) |
| 6 | Seguridad: encontró y corrigió un hallazgo CRÍTICO real (condonación de deuda sin autorización dual vía refinanciamiento), 1 ALTO y 2 MEDIO. | [etapa-6-seguridad.md](./etapa-6-seguridad.md) |
| 7 | Scoring e inteligencia: score crediticio del deudor (motor de reglas 0-100, banda A-E, 5 factores explicados) + alerta de cambio de patrón de pago. Última etapa — cierra el roadmap. | [etapa-7-scoring.md](./etapa-7-scoring.md) |

## Decisiones de negocio pendientes de confirmar (resumen)

Ver `decisiones-pendientes.md` para el detalle completo con el default
exacto aplicado en cada caso. Resumen de lo que sigue abierto (nada de
esto bloquea el uso del módulo — son valores de arranque razonables):

- **Excedente de un pago** y **pago retroactivo**: defaults configurables
  por producto / por rol, pendientes de confirmar el alcance exacto.
- **Umbrales de escalamiento de cobranza** (5/15/30/60 días): hardcodeados
  iguales para todas las empresas, no configurables por tenant todavía.
- **Reasignación masiva de cartera** (mover TODO de un cobrador a otro de
  un golpe): no existe, solo préstamo por préstamo.
- **WhatsApp de cobranza por API real**: se quedó en el link manual
  `wa.me` porque ningún tenant tiene un proveedor configurado.
- **PAR 30/60/90** (cartera en riesgo por antigüedad de capital): no
  existe, la distribución de mora por días es lo más cercano.
- **Pago mixto con una línea en efectivo**: no entra al cuadre de caja
  (solo pagos 100% en efectivo).
- **Fiscal de apertura/seguro**: sin integrar — requiere tocar un enum
  compartido por todo el motor de e-CF del ERP, decisión de negocio real
  pendiente sobre su tratamiento fiscal.
- **¿`cancelar()` de un préstamo sin desembolsar debería exigir
  autorización dual también?**: hoy no (ya no puede tocar dinero real),
  cambio de una línea si se quiere.
- **Pesos exactos del score** (Etapa 7): default de arranque, ajustable.
- **Reestructuración no cuenta como factor del score** (Etapa 7): no deja
  rastro estructurado en BD — necesitaría una tabla nueva
  (`pr_reestructuraciones`) si se quiere contar con precisión.
- **`pr_deudores.diasMoraHistorico` es una columna muerta** (Etapa 7,
  heredada de antes): nunca se escribe, siempre 0 — el CSV de Reportes
  que la exporta siempre trae 0 ahí. Corregirla es trabajo de
  Reportes/Etapa 4, no se tocó desde Scoring.
- **Score al vuelo, sin caché** (Etapa 7): si el volumen por tenant crece,
  hay una alternativa documentada (columna persistida + invalidación por
  mutación) — no construida hoy.

## Estado de la suite (actualizado 2026-10-13, tras mergear main de hoy)

Ver `merge-readiness.md` sección 7 para el detalle completo (comandos,
salida exacta, los 4 checks estáticos de CI, y el análisis de cada fallo).
Resumen:

- **Backend** (Jest): suite completa en verde salvo **1 fallo preexistente
  y ajeno a Prestamista** (`car-wash/services/cw-turnos.service.spec.ts`,
  módulo nunca tocado por esta rama — el test depende de la fecha real del
  sistema y coincide, por calendario, con el día de hoy). `npx tsc --noEmit`
  limpio.
- **Frontend** (Vitest): ver `merge-readiness.md` sección 7 para el conteo
  exacto de esta corrida. `npx tsc --noEmit` limpio, `npm run build` limpio.
  Los mismos archivos con timeouts intermitentes por contención de recursos
  ya documentados en etapas anteriores se re-verificaron aislados.
- Los 4 checks estáticos que exige CI (CAPA 3 entidades/migraciones, UPDATE
  RETURNING, filtro `empresaId` multi-tenant, `security-check.sh`) pasan
  los 4, sin advertencias nuevas.

## Dónde mirar primero

- Backend: `hi-cloud backend-project/backend/src/prestamista/` — cada
  subcarpeta es un servicio+controlador con sus tests junto al código
  (`*.spec.ts`).
- Frontend: `hi-cloud frontend-project/src/pages/prestamista/` — una
  página por pantalla del menú.
- Para el estado de preparación del merge a `main` (lo que se verificó, lo
  que se cerró, lo que sigue abierto como decisión de negocio), ver
  `merge-readiness.md` y `decisiones-pendientes.md` — este README es solo
  el mapa del módulo, no el informe de cierre.
