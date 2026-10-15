# Deuda técnica — Colisión de los módulos `bancos` y `tesoreria`
**Fecha del hallazgo:** 2026-10-15
**Origen:** incidente real — empresa 53 (LUBRI GOMAS PEÑA CASTILLO), el widget "Cuentas de Bancos" de Inicio mostraba RD$0.00 y "SCOTIABANK" genérico; "Cuentas Bancarias & Conciliación" mostraba RD$16,202.56 con el nombre real de la cuenta.
**Estado:** paliado (ver abajo) — la causa de fondo sigue sin resolverse, documentada aquí como proyecto aparte.

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
