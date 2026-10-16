# Deuda técnica — Colisión de los módulos `bancos` y `tesoreria`
**Fecha del hallazgo:** 2026-10-15
**Origen:** incidente real — empresa 53 (LUBRI GOMAS PEÑA CASTILLO), el widget "Cuentas de Bancos" de Inicio mostraba RD$0.00 y "SCOTIABANK" genérico; "Cuentas Bancarias & Conciliación" mostraba RD$16,202.56 con el nombre real de la cuenta.
**Estado:** paliado (ver abajo) — la causa de fondo sigue sin resolverse, documentada aquí como proyecto aparte.

---

## HALLAZGO MAYOR (misma tarde, segunda vuelta): movimientos_bancarios lleva toda su vida rechazando cualquier INSERT

Ver detalle completo más abajo en este documento, sección "Hallazgo mayor".

---

## Qué se corrigió ya (2026-10-15, bajo riesgo)

No se tocó la escritura de ningún módulo ni se migraron datos. Se agregó una
lectura unificada (`backend/src/common/cuentas-bancarias/saldo-cuenta-bancaria.util.ts`)
que usan ahora `BancosService.listarCuentas()`, `BancosService.getResumenConciliacion()`,
`TesoreriaService.getDashboard()` y `TesoreriaService.getCuentas()`, más el
cierre de un hueco de auditoría en `PATCH /tesoreria/cuentas/:id` (ver
"Hallazgo adicional" más abajo). Esto hace que el saldo y el nombre se vean
igual en todas las pantallas **hoy mismo**, sin esperar a la fusión real.

## La causa de fondo (sin resolver)

Dos módulos backend completamente independientes definen su propia entidad
TypeORM `CuentaBancaria`, y **ambas apuntan a la misma tabla física
`cuentas_bancarias`** por coincidencia de nombre, nunca a propósito:

| | `bancos` | `tesoreria` |
|---|---|---|
| Archivo entidad | `backend/src/bancos/entities/cuenta-bancaria.entity.ts` | `backend/src/tesoreria/entities/cuenta-bancaria.entity.ts` |
| Pantalla | "Cuentas Bancarias & Conciliación" (`/bancos`) | Dashboard "Cuentas de Bancos" + pestaña "Cuentas Bancarias" de `/tesoreria` |
| Identidad de la cuenta | `nombre` (alias/titular), `tipo` (incluye `empresarial`) | — (no tiene `nombre`) |
| Saldo | `saldoInicial` — estático, lo declara el usuario al registrar | `saldo` — libro vivo, se incrementa con cada movimiento |
| Tabla de movimientos | `bancos_conciliacion` (conciliación manual/CSV contra extracto) | `movimientos_bancarios` (ligado a CxC, CxP, nómina, depósitos/retiros manuales — ver `cxc.service.ts`, `cxp.service.ts`, `nomina.service.ts`, `recibos-cobro.service.ts`) |
| `synchronize` | `false` en producción (`data-source.ts`), pero la tabla real tiene la UNIÓN de ambos esquemas de columnas — evidencia de que en algún momento de desarrollo corrió con `synchronize: true` y ambas entidades fusionaron el esquema sin que nadie lo notara. |

Cada fila física solo usa **una** de las dos mitades de columnas (nunca se ha
visto una fila con `saldoInicial` y `saldo` distintos de cero a la vez), así
que hoy no hay corrupción de datos activa — solo lecturas incompletas,
que es lo que se corrigió arriba.

### Por qué NO se fusionó ahora

`tesoreria` está enganchado en vivo a CxC (cobros), CxP (pagos a
proveedores), nómina y asientos contables automáticos
(`asientos-automaticos.service.ts`). `bancos` es una herramienta de
conciliación bancaria más simple y autocontenida. Fusionarlos implica:

1. Decidir **una sola entidad canónica** (todo apunta a que debería ser la
   de `tesoreria`, por ser la que de verdad lleva un libro vivo con
   `saldoAnterior`/`saldoNuevo` por movimiento) y agregarle las columnas que
   hoy solo tiene `bancos` (`nombre`, `tipo` con el valor `empresarial`).
2. Migrar **datos existentes**: toda fila con `saldoInicial` > 0 necesita
   convertirse en un movimiento inicial de `movimientos_bancarios` (tal
   como ya hace `TesoreriaService.createCuenta()` al crear una cuenta desde
   cero — ver línea 128-142 de `tesoreria.service.ts`) para no perder el
   número ni el rastro.
3. Decidir qué pasa con `bancos_conciliacion`: ¿se migra a
   `movimientos_bancarios` con un `origen` nuevo ("conciliacion_manual"), o
   sigue viviendo aparte pero referenciando la cuenta unificada? La
   conciliación contra extracto bancario (CSV) es una función que
   `tesoreria` no tiene hoy.
4. Reescribir `BancosController`/`BancosService` para que operen sobre la
   entidad de `tesoreria` (o eliminarlos y migrar sus pantallas a
   `/tesoreria`), y actualizar `BancosPage.tsx` en el frontend.
5. Probar a fondo: CxC, CxP, nómina, asientos automáticos, conciliación CSV
   por banco (Banreservas/BHD/Popular/Scotiabank/APAP), y los reportes de
   Tesorería (flujo de caja, resumen) — todos leen de estas tablas.

**Riesgo:** alto. Tamaño estimado: varios días de trabajo + pruebas, no una
sesión. Debe planearse como proyecto aparte, con su propia migración de
datos y ventana de verificación en producción.

## Hallazgo adicional: hueco de auditoría en `PATCH /tesoreria/cuentas/:id` (cerrado)

El endpoint declaraba `@Body() dto: Partial<CreateCuentaBancariaDto>` **en
línea**, en vez de una clase DTO propia. TypeScript borra la información de
tipo de un `Partial<...>` genérico al compilar — en tiempo de ejecución el
parámetro queda tipado como `Object`, y el `ValidationPipe` global de Nest
(`whitelist: true, forbidNonWhitelisted: true`) **salta la validación por
completo** para los tipos nativos no-validables (`String, Boolean, Number,
Array, Object`). Resultado: el body llegaba intacto, sin whitelist, directo
a `cuentaRepository.update()` — cualquier campo, incluido uno que no existe
en ningún DTO (como `saldo`), se guardaba sin pasar por
`registrarDeposito`/`registrarRetiro`/`registrarTransferencia` (los únicos
caminos que de verdad auditan: `saldoAnterior`, `saldoNuevo`, `origen`,
`usuarioId`).

**Corregido** (commit de este mismo incidente): nueva clase
`UpdateCuentaBancariaDto` (`backend/src/tesoreria/dto/update-cuenta-bancaria.dto.ts`)
sin `saldo` ni `saldoInicial` — el `ValidationPipe` ahora sí corre y rechaza
esos campos con 400. El balance de una cuenta de tesorería solo puede
cambiar por un movimiento auditado, nunca por un PATCH directo.

### El caso concreto que esto explica (empresa 72, sin corregir — ver más abajo)

La empresa 72 (CHRIS MP BOCADILLOS SRL) tiene una cuenta (id 4, Banreservas,
ahorros) con `saldo = RD$153,777.00` y **cero movimientos** en
`movimientos_bancarios` o `bancos_conciliacion` — sin ningún rastro que
explique de dónde salió ese número. `audit_logs` solo registra dos POST a
`/api/v1/bancos/cuentas` (la creación de dos cuentas, el mismo día, segundos
aparte — ver "Datos pendientes de decisión" abajo), nada contra
`/api/v1/tesoreria/cuentas/4`. El mecanismo más probable es exactamente el
hueco de arriba: un PATCH con `{saldo: 153777}` que, antes de esta
corrección, se habría guardado sin dejar rastro en `audit_logs` de forma
consistente con lo que se observa. No se pudo confirmar con certeza total
cuál fue el origen exacto; lo que sí se confirmó y se cerró es la
vulnerabilidad que lo habría permitido.

## Datos pendientes de decisión (NO corregidos — fuera de este incidente)

- **Empresa 72**: dos cuentas bancarias registradas por el mismo usuario
  (Fiordaliza Pérez Ortiz) el mismo día, segundos aparte — mismo titular,
  Banreservas, dos números de cuenta distintos (9600815928 ahorros,
  9608623087 corriente). Probable doble clic/doble registro por error, no
  necesariamente dos cuentas reales. La cuenta de ahorros tiene el saldo de
  RD$153,777 sin rastro descrito arriba; la corriente está en RD$0.00 sin
  nada más.
- El cliente de la empresa 72 **ya ve** el RD$153,777 en el widget de Inicio
  hoy (antes y después de este fix — el número en sí no cambia, solo ahora
  también aparece correctamente en "Cuentas Bancarias"). No se recomienda
  tocarlo sin que el equipo humano confirme con el cliente si el monto es
  real antes de cualquier corrección.
- Cualquier corrección de estos datos debe hacerse con un script de
  dry-run aparte (mostrar qué cambiaría, sin aplicar nada, antes de tocar
  producción) — no como parte de este fix de lectura.

## Dónde revisar el formato elegido

La fórmula unificada y su razonamiento completo están documentados en el
docblock de `backend/src/common/cuentas-bancarias/saldo-cuenta-bancaria.util.ts`.

---

## Hallazgo mayor (misma tarde, segunda vuelta) — detalle completo

Después de arreglar la lectura (arriba), el saldo de la cuenta de la
empresa 53 saltó de RD$16,202.56 a RD$40,202.56 sin que el historial
mostrara nada nuevo. Causa real, confirmada con datos:

1. A las 21:55:30 del 2026-10-15, Elvin Peña (empresa 53) cobró RD$24,000
   en efectivo de la factura #27263 (cliente #38) vía CxC #246, pago
   RDP-00064 — 100% legítimo, confirmado en `pagos_cobrados` y `audit_logs`.
2. `cxc.service.ts` llama, después de guardar el cobro, a
   `TesoreriaService.registrarMovimientoAutomatico(...)` dentro de un
   `.catch(err => logger.error(...))` — si falla, el cobro ya se guardó
   pero el aviso solo queda en el log del servidor.
3. Esa llamada SIEMPRE fallaba, para cualquier empresa: `movimientos_bancarios`
   (la tabla real de la entidad de tesorería) tiene una columna huérfana
   `"cuentaId" INTEGER NOT NULL` que esa entidad (usa `cuentaBancariaId`)
   nunca llena. Confirmado: `SELECT COUNT(*) FROM movimientos_bancarios` →
   0 filas en TODA la base de producción, siempre.
4. Es un resto de la MISMA colisión de esquema ya diagnosticada a medias en
   `migrations/1748100000000-CreateBancosConciliacion.ts` — esa migración
   le dio al módulo `bancos` su propia tabla (`bancos_conciliacion`) y
   arregló SU lado, pero nunca limpió la columna que dejó en
   `movimientos_bancarios`, así que desde entonces es TESORERÍA quien
   rebota contra la misma pared, en sentido inverso.
5. Como el guardado del saldo y el del movimiento eran dos escrituras
   separadas sin transacción, el saldo SÍ se actualizaba y el movimiento
   NUNCA se guardaba — para cualquier depósito/retiro/transferencia manual
   y para cada cobro de CxC, pago de CxP, pago de nómina o recibo de cobro
   (no efectivo) de cualquier empresa, desde que la tabla quedó así.

Por qué solo 2 cuentas mostraban el síntoma (empresa 53 y 72): la mayoría
de las empresas no usa cuentas de tesorería con saldo activo. El bug (el
INSERT fallando) corría igual para todas; el síntoma solo se nota donde de
verdad hubo cobros/pagos por este camino.

### Corregido (commit de esta sesión)

1. Migración `1786000000000-FixMovimientosBancariosCuentaIdNotNull.ts` —
   `ALTER TABLE movimientos_bancarios ALTER COLUMN "cuentaId" DROP NOT NULL`.
   Sin esto, cualquier movimiento de tesorería sigue fallando siempre.
2. `registrarMovimiento()` (tesorería) ahora es atómico —
   `cuentaRepository.manager.transaction(...)`: si el INSERT del movimiento
   falla, el UPDATE del saldo se revierte con él.
3. EFECTIVO ya no se postea a tesorería en `cxc.service.ts`,
   `cxp.service.ts` y `recibos-cobro.service.ts` — antes CUALQUIER cobro/
   pago (incluido efectivo) se posteaba a "la cuenta DOP más antigua" de la
   empresa sin que el usuario pudiera elegir ninguna.
4. Los `.catch()` de `registrarMovimientoAutomatico` en cxc/cxp/recibos-cobro
   ahora también llaman a `reportServiceError` (Sentry) — antes un fallo
   solo quedaba en el log del servidor.
5. Nueva política explícita: `ajustarSaldo()` / `POST /tesoreria/movimientos/ajuste`
   (ADMIN/CONTADOR, motivo obligatorio ≥5 caracteres) — única forma
   legítima de cambiar un saldo fuera de una operación normal.
6. Defensa en profundidad en `BancosService.actualizarCuenta` y
   `TesoreriaService.updateCuenta` — UPDATE armado a mano con campos
   permitidos explícitos.
7. `BancosService.listarMovimientos()` unifica las DOS tablas de movimientos
   más el saldo de apertura como primera línea del historial.
8. `getResumenConciliacion()` corregido: "saldo inicial de un mes" =
   saldoInicial + TODOS los movimientos anteriores al mes, de ambas tablas.

### Datos corregidos (backfill, con transacción y verificación)

- Empresa 53, cuenta 7 (SCOTIABANK ···1851): se insertó el movimiento real
  que debió guardarse junto al cobro de CxC #246 (RDP-00064, efectivo,
  factura #27263, cliente #38, RD$24,000, 2026-10-15). No se tocó
  `cuentas_bancarias.saldo` (ya estaba correcto) — solo se rellenó el
  movimiento que faltaba, con saldoAnterior/saldoNuevo calzando exacto.

### Datos pendientes de decisión (NO corregidos)

- Empresa 72, cuenta 4 (Banreservas ···5928, saldo RD$153,777): a
  diferencia de la empresa 53, no tiene un origen único y limpio.
  Reconstruido con todo lo que existe en `recibos_cobro` + `pagos_cobrados`
  (13 transacciones reales, no-efectivo, 2026-09-08 a 2026-09-22): suman
  RD$135,476.98 — quedan RD$18,300.02 sin explicar incluso revisando CxP
  (vacío) y movimientos manuales de tesorería (vacío) para esa empresa. No
  se inventó ningún movimiento para cubrir la diferencia.
- Integrar el efectivo de CxC directo / Recibos de Cobro con el cuadre de
  Caja (hoy, tras el fix, un cobro en efectivo por esos dos caminos no
  aparece en ningún lado — antes al menos se posteaba, mal, a un banco).
- `nomina.service.ts.pagarPeriodo()` llama a `registrarMovimientoAutomatico`
  SIN `.catch()` — si tesorería falla, la petición entera falla, pero
  `estado = PAGADA` ya se guardó antes, fuera de cualquier transacción
  compartida. No tocado (nómina no tiene concepto de efectivo).
- `BancosService.importarCSV()` tiene un bug de nombres de columna
  independiente (usa `cuentaBancariaId` contra una entidad que solo tiene
  `cuentaId`) — cada fila importada probablemente falla en silencio. No
  tocado, mismo patrón de confusión entre los dos módulos, fuera de alcance.
