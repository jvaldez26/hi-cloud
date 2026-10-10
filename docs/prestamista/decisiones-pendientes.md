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
- **Anular pagos**: Etapa 2. Default propuesto: solo ADMIN, motivo
  obligatorio, autorización de supervisor siempre (sin importar el rol —
  a diferencia de `pago_retroactivo`, dado que mueve dinero ya aplicado).
- **Tratamiento fiscal (e-CF/ITBIS por concepto)**: Etapa 5. Por instrucción
  explícita, NO se decide — se construye la integración pero queda
  desactivada hasta que se configure cada concepto en Productos de Préstamo
  (sección "Fiscal", ya existe en el formulario desde la Fase 2B, hoy vacía
  a propósito).
