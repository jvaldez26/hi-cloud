# Etapa 1 — Simulador avanzado

Lo que ya existe (Fase 2B, en producción local): el Simulador acepta todos
los parámetros del motor v2 (frecuencia + subconfig, tasa, método, plazo,
fechas) y muestra la tabla al instante contra `POST /prestamista/prestamos/simular`.
Esta etapa agrega lo que falta: comparador, PDF, guardar/recuperar/duplicar
y convertir en solicitud.

## Comparador de escenarios

Sin endpoint nuevo — el frontend dispara N llamadas en paralelo a
`/prestamos/simular` (una por escenario: mismo monto, distinto plazo/tasa/
frecuencia/método) y pinta los resultados lado a lado: cuota, interés
total, costo total del crédito, TEA, y una columna de diferencia contra el
primer escenario (el "base"). Cada escenario es una fila editable del
formulario del Simulador, no una pantalla aparte.

## Tabla nueva: `pr_simulaciones`

```sql
CREATE TABLE pr_simulaciones (
  id SERIAL PRIMARY KEY,
  "empresaId" INTEGER NOT NULL,
  "deudorId" INTEGER NULL,              -- null = prospecto sin ficha todavía
  "nombreProspecto" VARCHAR(200) NULL,  -- obligatorio si deudorId es null
  nombre VARCHAR(200) NOT NULL,         -- "Préstamo 50k a 12 meses", editable
  parametros JSONB NOT NULL,            -- motorConfig + montoPrincipal/fechas/plazoPeriodos
  resultado JSONB NOT NULL,             -- TablaAmortizacion completa, calculada UNA vez al guardar
  "creadoPor" INTEGER NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pr_simulaciones_empresa ON pr_simulaciones("empresaId");
CREATE INDEX idx_pr_simulaciones_deudor ON pr_simulaciones("empresaId", "deudorId");
```

`resultado` se guarda calculado (no se recalcula en cada listado) — si el
motor cambia después, una simulación vieja sigue mostrando lo que el
deudor realmente vio, igual que el principio ya establecido para
`pr_prestamos.motorConfig` (snapshot, nunca se resincroniza).

## Endpoints

- `POST /prestamista/simulaciones` — guarda `{ deudorId?, nombreProspecto?, nombre, parametros }`, calcula `resultado` con el motor v2 (reusa la misma función que `/prestamos/simular`) y lo persiste.
- `GET /prestamista/simulaciones?deudorId=` — lista (todas o por deudor), sin el `resultado` completo (solo los totales, para la tabla).
- `GET /prestamista/simulaciones/:id` — una simulación completa (para "recuperar": recarga el formulario del Simulador con sus `parametros` tal cual, y "duplicar": igual pero sin `id`, como punto de partida de una nueva).
- `DELETE /prestamista/simulaciones/:id`.
- `POST /prestamista/simulaciones/:id/convertir-solicitud` — exige `deudorId` (si la simulación era de un prospecto sin ficha, el frontend primero pide crear/elegir el deudor); crea la solicitud con `montoSolicitado`/`plazoMeses`/`frecuenciaPago` desde `parametros`, y referencia a la simulación de origen (columna `simulacionId` en `pr_solicitudes`, nullable) para trazabilidad.

## PDF de cotización

Nuevo método en `prestamista-pdf.service.ts`, mismo membrete ya construido
para los otros 3 documentos (nombre de la empresa + RNC/dirección/teléfono
+ "Generado por HiCloud"): monto, parámetros, tabla de amortización
completa, totales y TEA. Reusa `dibujarRecibo`-style factoring para poder
adjuntarlo por correo más adelante si hace falta (no en el alcance de esta
etapa — el pedido solo dice "PDF de la cotización").

## Multi-tenant y permisos

Mismos guards que el resto del módulo (`JwtAuthGuard, TenantGuard,
RolesGuard, ModuloAddonGuard('prestamista')`), roles ADMIN/CONTADOR/VENDEDOR
para crear/listar/convertir, igual que Simulador y Solicitudes hoy.

## Tests

- Contrato: DTOs de `CrearSimulacionDto`/`ConvertirSimulacionDto` contra el
  payload real del frontend.
- Unit: `convertirSolicitud` rechaza sin `deudorId`; `guardar` recalcula con
  el motor y no confía en un `resultado` que mande el cliente.
- E2E: simular → guardar → recuperar → duplicar → convertir en solicitud,
  contra los servicios reales (mismo patrón `BaseEnMemoria` ya usado).

## Resumen (cerrado 2026-10-09)

Implementado: migración (`pr_simulaciones` + `pr_solicitudes.simulacionId`),
`SimulacionesService`/`SimulacionesController` (crear/listar/obtener/
eliminar/convertir), PDF de cotización, y el frontend completo (guardar,
"Mis simulaciones" con recuperar/duplicar/PDF/convertir/eliminar,
comparador de hasta 4 escenarios lado a lado). 22 tests nuevos (contrato +
e2e contra servicios reales) en verde, suite completa del backend (4689)
en verde, `tsc` limpio en los dos lados.

**Qué probar:** guardar una simulación con deudor existente y con
prospecto (nombre libre); recuperar/duplicar desde "Mis simulaciones";
comparar 2-3 escenarios con distinto plazo/tasa/método; convertir una
simulación de prospecto (debe pedir elegir deudor) y una de deudor real
(no debe pedir nada); PDF de cotización.

**Pausa:** un incidente urgente de producción (cierre de caja) interrumpe
la cadena de etapas aquí — Etapa 2 continúa después de resolverlo.
