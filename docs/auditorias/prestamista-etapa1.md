# Auditoría Prestamista/Financiamiento — Etapa 1: diagnóstico real

**Fecha:** 2026-10-09
**Alcance:** todo lo detrás del menú Prestamista/Financiamiento (Panel, Deudores, Solicitudes, Préstamos, Simulador, Cobranza, Vehículos, Productos, Reportes): frontend, backend, entidades, migraciones, crons, y su relación con caja, contabilidad, fiscal (e-CF/607) y clientes.
**Método:** auditoría 100% de lectura de código. No se modificó ningún archivo, no se tocó producción ni base de datos, no se ejecutó ninguna migración. Toda afirmación lleva cita `archivo:línea`. Los puntos más críticos (motor de amortización, flujo de pagos, el bug de Solicitudes, el bug del Simulador, el gap multiempresa en desembolso directo) fueron releídos y verificados personalmente línea por línea, no solo tomados de los sub-informes de investigación.
**Convención:** todo lo marcado como "Verificado" fue leído directamente en el código citado. Todo lo marcado "Recomendación" es una opinión de ingeniería, no una conclusión normativa — las decisiones de qué exige la norma DGII/legal quedan para el usuario.

---

## A. Inventario y estado real por pantalla/funcionalidad

| Pantalla/función | Estado | Endpoints | Tablas | Tests |
|---|---|---|---|---|
| Panel (Dashboard) | **Parcial** — el KPI "Vencidos" y la distribución de mora por estado "vencido" siempre muestran 0 (ver A.1) | `GET /prestamista/dashboard`, `GET /prestamista/vehiculos/alertas-seguro` | pr_prestamos, pr_deudores, pr_solicitudes, pr_pagos, pr_vehiculos | No |
| Deudores + Ficha | **Completo**, con un bug puntual: guardar `nivelRiesgo='critico'` da 400 (ver A.2) | `GET/POST/PATCH /prestamista/deudores(/:id)`, `GET /prestamista/garantias/deudor/:id`, `GET /prestamista/pdf/estado-cuenta/:id` | pr_deudores, pr_prestamos, pr_garantias | No |
| **Solicitudes** | **ROTA** en el paso crítico — decidir (aprobar/rechazar) siempre falla (ver B.0, CRÍTICO) | `GET/POST/PATCH /prestamista/solicitudes(/:id)`, `POST .../:id/decidir` | pr_solicitudes, pr_deudores | DTO aislado sí, servicio no |
| Préstamos + Detalle | **Completo y bien construido** — desembolso transaccional, bloqueo FOR UPDATE, rechazo de doble desembolso | `GET/POST /prestamista/prestamos`, `.../simular`, `.../:id/cancelar`, `.../:id/recalcular` | pr_prestamos, pr_cuotas, pr_deudores, pr_productos_prestamo, pr_solicitudes | Sí (`desembolso-transaccional.spec.ts`) |
| **Simulador** | **ROTO end-to-end** — ningún intento de simular puede completarse hoy (ver B.0b, CRÍTICO) | `POST /prestamista/prestamos/simular` | ninguna (cálculo puro) | No |
| Cobranza | **Parcial** — filtro "vencido" muerto (igual que Panel); historial de gestiones expuesto por API pero sin pantalla que lo muestre | `.../cartera-vencida`, `.../resumen`, `.../gestiones`, `.../notificar-mora` | pr_prestamos, pr_deudores, pr_cobranzas, empresa | Sí, pero solo del cron de mora |
| Vehículos | **Completo** | `GET/POST/PATCH /prestamista/vehiculos(/:id)`, alertas-seguro, buscar-placa | pr_vehiculos, pr_prestamos | No |
| Productos de Préstamo | **Parcial** — flags `requiereGarantia`/`requiereGarante` decorativos, nadie los lee | `GET/POST/PATCH /prestamista/productos-prestamo(/:id)` | pr_productos_prestamo | No |
| Reportes | **Parcial** — 1 de 12 reportes del backend (estado de cuenta por deudor) no tiene tarjeta en la UI | `GET /prestamista/reportes/{tipo}` ×12 | pr_prestamos, pr_deudores, pr_pagos, pr_cuotas, pr_garantias, pr_cobranzas, pr_refinanciamientos, pr_productos_prestamo | No |
| Refinanciamiento | **Backend completo, 100% inalcanzable desde la UI** — no hay pantalla, solo API directa | `GET .../refinanciamientos/prestamo/:id`, `POST .../refinanciamientos` | pr_refinanciamientos, pr_prestamos, pr_cuotas | Sí (`desembolso-transaccional.spec.ts`) |
| Garante (co-firmante) | **Inexistente más allá del esquema** — tabla `pr_garantes` sin controller, sin service, sin DTO, sin UI | ninguno | pr_garantes (vacía) | No |

### A.1 — Hallazgo transversal: el estado `'vencido'` nunca se escribe, solo se lee

**Verificado.** Los únicos estados que el código realmente asigna a `pr_prestamos.estado` son `'al_dia'`, `'moroso'`, `'pagado'`, `'cancelado'`, `'refinanciado'` (`prestamos.service.ts:169-171,248-250,261`, `pagos.service.ts:169-171`, `mora.cron.ts:78-79`, `refinanciamiento.service.ts:82`). Las referencias a `'vencido'` existen solo como lecturas (`WHERE estado IN ('moroso','vencido')`) en `dashboard.service.ts:17,60`, `cobranza.service.ts:20,31,181-188`, `reportes.service.ts:65,153,281`. Consecuencia: el KPI "Vencidos" del Dashboard, el filtro "Vencido" de `PrestamosPage.tsx:127`, y el contador de Cobranza siempre devuelven 0 — es un valor que la UI permite filtrar pero el motor nunca produce.

### A.2 — Hallazgo transversal: mismatch de `nivelRiesgo`

**Verificado por el inventario, no releído personalmente.** Frontend (`DeudoresPage.tsx:214-220`) ofrece `bajo|medio|alto|critico`; el DTO (`dto/prestamista.dto.ts:244`) exige `@IsIn(['bajo','medio','alto','muy_alto'])`. Guardar un deudor con riesgo "Crítico" devuelve 400.

### A.3 — Funcionalidad huérfana o inalcanzable (confirmado por inventario)

- `DELETE /prestamista/deudores/:id` y `DELETE /prestamista/productos-prestamo/:id` existen (soft-delete) pero no tienen botón en ninguna pantalla.
- El campo `vehiculoId` capturado en el formulario de Solicitudes no existe en `CrearSolicitudDto` ni en `pr_solicitudes` — se descarta silenciosamente por el whitelist del `ValidationPipe`.
- `ActualizarGarantiaDto`/`PATCH /prestamista/garantias/:id` existen pero ninguna pantalla los llama — sin liberación de garantía al pagar, sin tasación periódica.
- `GET /prestamista/reportes/estado-cuenta-deudor/:deudorId` existe en el backend pero no tiene tarjeta en `ReportesPrestamistaPage.tsx`.
- `pr-garante.entity.ts` (co-firmante) está registrada en `prestamista.module.ts` pero no tiene controller/service/DTO — tabla fantasma.

---

## B. Auditoría matemática — motor de cálculo

### B.0 — CRÍTICO: "Aprobar/Rechazar solicitud" está roto end-to-end

**Verificado personalmente.** El frontend (`SolicitudesPage.tsx:199-200`) manda `decision: 'rechazar'` / `decision: 'aprobar'` (infinitivo). El DTO (`dto/prestamista.dto.ts:72-74`) exige `@IsIn(['aprobada', 'rechazada'])` (participio). El `ValidationPipe` global usa `whitelist:true, forbidNonWhitelisted:true` (`main.ts:176`), confirmado en código — un valor fuera de la lista permitida es rechazado con 400 antes de llegar al controller. **Todo clic en "Aprobar" o "Rechazar" en producción devuelve 400.** Es el paso obligatorio antes de poder desembolsar (`prestamos.service.ts:128` exige `sol.estado === 'aprobada'`), así que ninguna solicitud puede avanzar desde la pantalla hoy.

### B.0b — CRÍTICO: el Simulador está roto end-to-end

**Verificado personalmente, leyendo los tres archivos involucrados.**
- `PrestamosService.simular()` (`prestamos.service.ts:70`) destructura `{ principal, tasaInteresMensual, plazoMeses, fechaPrimerPago, metodoAmortizacion }`.
- `SimularPrestamoDto` (`dto/prestamista.dto.ts:149-167`) solo declara `montoPrincipal, plazoMeses, tasaInteresMensual, porcentajeMora, diasGracia, fechaDesembolso` — **no existen `principal`, `fechaPrimerPago` ni `metodoAmortizacion` en el DTO.**
- El frontend (`SimuladorPage.tsx:16-22`) manda exactamente `principal`, `metodoAmortizacion`, `fechaPrimerPago` — los tres campos que el DTO no permite.
- Con `forbidNonWhitelisted:true` (confirmado en `main.ts:176`), cualquier propiedad no declarada en el DTO hace que NestJS rechace la petición completa con 400, **antes** de llegar al servicio.

Conclusión: cada clic en "Simular" en producción debe estar devolviendo 400 para cualquier entrada. Esto no se pudo confirmar contra producción en vivo (auditoría de solo código), pero el código deja sin salida ninguna combinación de datos.

### B.1 — Métodos de amortización realmente soportados

**Verificado personalmente en `amortizacion.util.ts`.**

| Método | ¿Implementado? |
|---|---|
| Francés (cuota fija, saldo insoluto) | Sí — `amortizacionFrancesa()` líneas 32-85 |
| Alemán (capital fijo) | Sí — `amortizacionAlemana()` líneas 87-124 |
| Americano (bullet) | **No** — no existe en el código |
| Flat / interés simple sobre monto original | **No** — no existe |
| Saldo insoluto como variante separada | No aplica — es lo que ya hacen francés y alemán |

`calcularAmortizacion()` (líneas 126-136) es un ternario `metodo === 'aleman' ? alemana : francesa` — ni el tipo (`'frances' | 'aleman'`) contempla "americano". **Pero** `CrearProductoPrestamoDto`/`ActualizarProductoPrestamoDto` (`dto/prestamista.dto.ts:390,440`) sí permiten `metodoAmortizacion: 'americano'` vía `@IsIn(['frances','aleman','americano'])` — se puede guardar un producto con ese valor, y si llegara a `calcularAmortizacion()` se trataría como francés **sin ningún error ni aviso**. En la práctica esto no ocurre hoy porque el valor nunca fluye hasta el préstamo real (ver B.5).

### B.2 — Tipo de interés, frecuencia, gracia, base de días (todo verificado en código)

- **Interés simple por período sobre saldo pendiente**, nunca compuesto dentro del préstamo: `interes = r2(saldo * i)` (`amortizacion.util.ts:53,102`).
- **Frecuencia de pago declarada pero sin efecto real**: el DTO permite `mensual|quincenal|semanal|unico` (`dto/prestamista.dto.ts:387,437`), pero ninguna función de amortización recibe un parámetro de frecuencia — las fechas siempre avanzan por `addMeses()` (`amortizacion.util.ts:21-30,71,110`). Un producto "quincenal" genera cuotas **mensuales** igual.
- **Período de gracia solo afecta cuándo empieza a contar mora**, no la tabla de cuotas: `diasGracia` se usa únicamente en `mora.cron.ts:40,79` (filtro de mora y de estado "moroso"); ninguna función de amortización lo recibe. No existe gracia de capital ni de interés al generar el plan.
- **Base de días híbrida**: la tasa de mora se calcula como `pct/100/30` — "mes comercial de 30 días" (`mora.util.ts:32-36`) — pero se multiplica por días **calendario reales** (`CURRENT_DATE - fechaVencimiento`, `mora.cron.ts:19`). No es ACT/360 ni ACT/365 de mercado; es una convención propia. El interés normal de cada cuota no usa ningún conteo de días — es `saldo × tasaMensual` sin prorrateo.
- **`tipoTasa` ('mensual'/'anual') es un campo muerto**: se guarda pero nunca se convierte — una tasa configurada como "anual" se trata literalmente como mensual (error de 12x si alguien la usa esperando conversión).

### B.3 — Verificación matemática a mano: RD$100,000 a 12 meses al 3% mensual

Verificado ejecutando el algoritmo exacto del código (mismo orden de redondeo, misma `r2()`) y comparando contra la fórmula de libro de texto sin redondeo intermedio.

**Francés** — `cuotaFija = RD$10,046.21` (coincide con la fórmula estándar). Tabla resultante (extracto):

| Cuota | Interés | Capital | Cuota Total | Saldo |
|---|---|---|---|---|
| 1 | 3,000.00 | 7,046.21 | 10,046.21 | 92,953.79 |
| 2 | 2,788.61 | 7,257.60 | 10,046.21 | 85,696.19 |
| 12 | 292.61 | 9,753.58 | **10,046.19** | 0.00 |

La cuota 2 difiere en 1 centavo de la fórmula de libro de texto pura (7,257.59 vs. 7,257.60) porque el código redondea `cuotaFija` primero y resta el interés ya redondeado, en vez de redondear solo al final — "redondeo en cascada", esperable y pequeño.

**Alemán** — `capitalFijo = RD$8,333.33` (la fórmula exacta sería 8,333.3333...). Tabla resultante (extracto):

| Cuota | Interés | Capital | Cuota Total | Saldo |
|---|---|---|---|---|
| 1 | 3,000.00 | 8,333.33 | 11,333.33 | 91,666.67 |
| 12 | 250.00 | **8,333.37** | 8,583.37 | 0.00 |

**Conclusión verificada**: ambos métodos **sí cierran la deuda en RD$0.00 exacto** — el código fuerza explícitamente `cap = r2(saldo)` en la última cuota (`amortizacion.util.ts:57-60,103`). Pero en ambos métodos, **la última cuota no es idéntica a las anteriores** (2-4 centavos de diferencia): absorbe la deriva de redondeo acumulada. Correcto para "no dejar residuo", pero contradice la expectativa de "cuota fija" que se le muestra al cliente — si un cliente ve "RD$10,046.21 cada mes" y en el último mes paga RD$10,046.19, podría objetarlo aunque la diferencia sea mínima.

### B.4 — Precisión del dinero

- Todas las columnas monetarias son `decimal` en Postgres (`pr-prestamo.entity.ts:11-29`, `pr-cuota.entity.ts:10-18`, `pr-pago.entity.ts:11-15`) — correcto, sin pérdida de precisión en la BD.
- El redondeo `Math.round(n*100)/100` (`r2()`) está **duplicado 5 veces** de forma idéntica en `amortizacion.util.ts:17-19`, `mora.util.ts:22-24`, `pagos.service.ts:21`, `refinanciamiento.service.ts:17`, `prestamos.service.ts:241` — consistente hoy, pero frágil: una corrección futura en un solo sitio desincronizaría los otros cuatro sin que nada lo detecte.
- **Inconsistencia de escala confirmada**: `tasaInteresMensual`/`porcentajeMora` se validan en el DTO con `@IsNumber({ maxDecimalPlaces: 4 })` (confirmado en `dto/prestamista.dto.ts:99-100,126,156,159,393,399,443,449`), pero las columnas son `decimal(6,3)` — 3 decimales. Un valor como `3.1234` pasa la validación y Postgres lo trunca silenciosamente a `3.123`.
- **La fórmula "saldo de mora pendiente" está triplicada como SQL crudo** en `prestamos.service.ts:234`, `pagos.service.ts:154`, `mora.cron.ts:70`, en vez de usar la función centralizada y probada `sumarSaldoMoraPendiente()` de `mora.util.ts:79-88` — que resulta ser código muerto en producción (nunca se importa fuera de su propio spec). Hoy las tres copias son idénticas, pero la intención documentada en el propio comentario del archivo ("ambos caminos deben usar la misma definición: la de aquí") no se cumple en la práctica.

### B.5 — Duplicación de lógica financiera: Simulador vs. préstamo real

**Verificado.** No hay dos motores matemáticos distintos — tanto `simular()` (`prestamos.service.ts:69-82`) como `crearEnTransaccion()` (línea 166) llaman a la misma función `calcularAmortizacion()`. Eso está bien hecho. Pero hay una fuga de contrato en ambos extremos:

1. El simulador está roto por el desajuste de nombres descrito en B.0b.
2. **El método "alemán" configurado en un producto nunca llega a un préstamo real.** Verificado: `CrearPrestamoDto` (`dto/prestamista.dto.ts:83-113`) no declara `metodoAmortizacion`; el formulario de desembolso (`PrestamosPage.tsx`) no tiene selector de método; `pr_solicitudes` no tiene esa columna; y `crearEnTransaccion()` (`prestamos.service.ts:134-141`) copia tasa/plazo/frecuencia desde la solicitud pero **nunca copia ni lee `metodoAmortizacion` del producto**. El resultado: `data.metodoAmortizacion ?? 'frances'` (línea 167,192) siempre resuelve a `'frances'` en la práctica — **todo préstamo real se crea en francés**, sin que nadie lo elija ni lo sepa, aunque el producto diga "alemán". `refinanciamiento.service.ts:94` repite el patrón con el método **hardcodeado literal** `'frances'`, ignorando incluso el método del préstamo original.

### B.6 — Mora

**Verificado.** Fórmula: `mora = r2(saldoBase × (porcentajeMoraMensual/100/30) × diasMora)` (`mora.util.ts:35,59`), donde `saldoBase` = capital+interés pendiente **de esa cuota específica** (`mora.cron.ts:43-45`), nunca sobre el saldo total del préstamo. No se capitaliza (no hay mora sobre mora). Tiene un mecanismo de "trinquete" (`mora.cron.ts:49-56`): solo sube, nunca baja, aunque un pago parcial reduzca `saldoBase` a mitad de un período de atraso — favorece levemente al deudor en ese caso borde, pero evita el bug histórico ya corregido (documentado en el propio archivo) de "resucitar" mora ya cobrada.

Caso verificado a mano (cuota RD$9,456, 15 días de atraso, 5%/mes — tasa de referencia del propio spec, ya que el default de `porcentajeMora` es 0 y nadie lo configura explícitamente en los datos auditados):
```
tasaDiaria = 5/100/30 = 0.0016666...
mora = r2(9456 × 0.0016666... × 15) = r2(236.4) = RD$236.40
```
Consistente con el test existente (`mora.util.spec.ts:27-32`: `calcularMoraCuota(10000,5,10) ≈ 166.67`).

**Dato operativo relevante**: `porcentajeMora` tiene default `0` tanto en producto como en préstamo — si nadie lo configura explícitamente, el sistema **nunca cobra mora**, sin aviso.

### B.7 — Comisiones y cargos: campos decorativos

**Verificado.** `cargoCierre`/`porcentajeCargoCierre` se capturan en el formulario de producto y se guardan en `pr_productos_prestamo`/`pr_prestamos` (`productos-prestamo.service.ts:39`, `prestamos.service.ts:193`), pero:
- `porcentajeCargoCierre` nunca se usa para calcular `cargoCierre` (no hay `cargoCierre = monto × porcentaje/100` en ningún archivo).
- `cargoCierre` nunca se descuenta del desembolso, no aparece en el asiento contable de desembolso (`asientos-automaticos.service.ts:1826-1860` registra solo el monto principal), no aparece en ninguna cuota, y la columna `aplicadoCargos` de `pr_pagos` (`pr-pago.entity.ts:15`) nunca se escribe (confirmado: no aparece en el INSERT de `pagos.service.ts:138-146`).

Si una empresa configuró "2% de cargo de cierre" esperando cobrarlo, ese dinero **nunca se cobra**. La mora es el único cargo adicional que de verdad se calcula y se cobra.

---

## C. Problemas encontrados en código existente

Ordenados por severidad.

### C1 — CRÍTICO — Ausencia total de idempotencia en el registro de pagos
**Evidencia:** `RegistrarPagoDto` (`dto/prestamista.dto.ts:25-46`) no tiene ningún campo de clave de idempotencia; `PrPago` (entidad) no tiene ningún índice único; `pagos.service.ts:38-219` no maneja ningún código de error de violación de unicidad. Contraste directo con el patrón ya existente en el codebase: `Factura.claveIdempotencia` + índice único `(empresaId, claveIdempotencia)` + manejo explícito del error Postgres `23505` en `facturas.service.ts:680-690`, y el equivalente en Compras (`1769000000000-AddClaveIdempotenciaToCompras.ts`).
**Impacto:** un doble clic o un reintento de red en `POST /prestamista/pagos` crea dos filas en `pr_pagos` y aplica el dinero dos veces. El bloqueo `FOR UPDATE` de las cuotas (`pagos.service.ts:73-77`) protege contra que dos pagos simultáneos pisen la misma cuota, pero **no impide que el segundo pago, ya desbloqueado, aplique su dinero a la cuota siguiente** — deja esa cuota erróneamente pre-pagada y duplica el registro contable/fiscal de un mismo evento real de cobro.
**Solución propuesta:** trasplantar el mismo patrón ya validado (columna `claveIdempotencia`, índice único `(empresaId, claveIdempotencia)`, captura del error `23505` devolviendo el pago ya existente en vez de crear uno nuevo).

### C2 — CRÍTICO — "Aprobar/Rechazar solicitud" roto end-to-end (ver B.0)
**Evidencia:** `SolicitudesPage.tsx:199-200` vs. `dto/prestamista.dto.ts:72-74` vs. `main.ts:176`.
**Impacto:** ninguna solicitud puede aprobarse o rechazarse desde la interfaz — bloquea el flujo completo de originación de préstamos (nadie puede llegar a desembolsar, porque el desembolso exige `estado='aprobada'`).
**Solución propuesta:** unificar el vocabulario — cambiar el `Select` del frontend para enviar `'aprobada'/'rechazada'`, o relajar el DTO para aceptar ambos vocabularios. Agregar un test que mande el payload real que construye la pantalla (no solo el DTO aislado), para que este tipo de desajuste no vuelva a pasar inadvertido.

### C3 — CRÍTICO — Simulador roto end-to-end (ver B.0b)
**Evidencia:** `prestamos.service.ts:70` vs. `dto/prestamista.dto.ts:149-167` vs. `SimuladorPage.tsx:16-22`.
**Impacto:** la pantalla de Simulador no puede completar ninguna simulación.
**Solución propuesta:** unificar los nombres de campo entre DTO, servicio y frontend (hoy son tres vocabularios distintos: `principal/fechaPrimerPago/metodoAmortizacion` en servicio y frontend, `montoPrincipal/fechaDesembolso` sin `metodoAmortizacion` en el DTO). Agregar un test de la ruta completa (no solo del DTO aislado).

### C4 — ALTO — El método de amortización del producto nunca llega al préstamo real (ver B.5)
**Evidencia:** `CrearPrestamoDto` sin campo `metodoAmortizacion`; `prestamos.service.ts:134-141` no copia ese campo desde el producto/solicitud; `refinanciamiento.service.ts:94` lo hardcodea a `'frances'`.
**Impacto:** cualquier producto configurado como "alemán" es contablemente equivalente a "francés" en la práctica — el cliente nunca recibe la tabla de amortización que el producto promete.
**Solución propuesta:** hacer que `crearEnTransaccion()` lea `metodoAmortizacion` de `pr_productos_prestamo` cuando hay `productoId`, y que `refinanciamiento.service.ts` use el método del préstamo original en vez de un literal fijo.

### C5 — ALTO — Gap de aislamiento multiempresa en desembolso directo y en garantías
**Evidencia:** verificado en `prestamos.service.ts:119-198` — `crearEnTransaccion()` solo valida pertenencia del deudor a la empresa cuando el desembolso viene de una solicitud (líneas 122-127); si se desembolsa directo (`POST /prestamista/prestamos` sin `solicitudId`, camino válido para ADMIN/CONTADOR), `data.deudorId` se usa sin validar empresa (línea 190). Confirmado también que `findAll`/`findOne`/`orFail` (líneas 19-56) hacen `JOIN pr_deudores d ON d.id=p."deudorId"` **sin filtrar `d."empresaId"`** — solo filtran `p."empresaId"`. Mismo patrón en `garantias.service.ts:32-45` (sin validar `deudorId`/`prestamoId` de la empresa) y expuesto por `reportes.service.ts:175-184`.
**Impacto:** un préstamo creado apuntando al `deudorId` de otra empresa expondría nombre/cédula/teléfono/foto de ese deudor ajeno en listados y reportes de la empresa atacante.
**Solución propuesta:** agregar la misma validación `assertDeudorDeEmpresa` que ya existe en `solicitudes.service.ts:22-31` al camino de desembolso directo y a `garantias.service.ts`, y agregar el filtro `d."empresaId"=$N` a los JOINs de lectura como defensa adicional.

### C6 — ALTO — El refinanciamiento no genera ningún asiento contable
**Evidencia:** `refinanciamiento.service.ts` no importa `AsientosAutomaticosService` (líneas 1-15); `refinanciarEnTransaccion` (líneas 50-140) solo hace INSERT/UPDATE sobre tablas `pr_*`.
**Impacto:** la condonación de mora (`moraCondonada`) y de interés (`interesCondonado`) es una pérdida contable real que nunca se registra como gasto/castigo; al cerrar el préstamo original (`estado='refinanciado'`), la Cartera de Crédito que se debitó en el asiento de desembolso original queda contablemente desconectada del saldo operativo real.
**Solución propuesta:** agregar un asiento de refinanciamiento (reversa de cartera del préstamo original + reconocimiento del gasto por condonación + alta de cartera del préstamo nuevo), siguiendo el mismo patrón que `asientoDesembolsoPrestamo`/`asientoPagoPrestamo`.

### C7 — ALTO — El módulo no toca el sistema de caja del POS
**Evidencia:** grep de `CajaService|caja.service|cajaId|abrirCaja|cerrarCaja` en todo `src/prestamista` → 0 resultados.
**Impacto:** el efectivo de un desembolso o de un cobro en efectivo es invisible para el cierre de caja operativo del cajero — el dinero de préstamos vive únicamente en el libro contable (cuenta "Caja" como concepto, no como sesión física), nunca en el arqueo real del turno.
**Solución propuesta:** decisión de producto, no solo técnica — si se decide que el efectivo de préstamos debe pasar por caja, requeriría integrar `pagos.service.ts`/`prestamos.service.ts` con `caja.service.ts` dentro de la misma transacción.

### C8 — MEDIO — `cancelar()` no reversa el asiento contable ni libera garantías
**Evidencia:** `prestamos.service.ts:259-273` solo cambia `estado='cancelado'` y decrementa `prestamosActivos` del deudor — no toca contabilidad ni `pr_garantias`.
**Impacto:** cancelar un préstamo deja el asiento de desembolso contable intacto y las garantías asociadas sin liberar.
**Solución propuesta:** agregar reversa contable y liberación de garantía al cancelar, análogo al hallazgo de la Auditoría Contable 2026-09-09 (ya registrado en memoria del proyecto).

### C9 — MEDIO — `cargoCierre`/`porcentajeCargoCierre` son campos muertos (ver B.7)
**Impacto:** cobro de apertura configurado pero nunca ejecutado — pérdida de ingreso esperado por la empresa.
**Solución propuesta:** decisión de producto sobre si se implementa el cobro real (descuento del desembolso + asiento + posible e-CF) o se retira el campo de la UI si no se va a usar.

### C10 — MEDIO — `frecuenciaPago` y `tipoTasa` configurables sin efecto real (ver B.2)
**Impacto:** configuración engañosa — un producto "quincenal" o con tasa "anual" se comporta exactamente igual que uno "mensual" con la tasa tratada como mensual directa.
**Solución propuesta:** o se implementa la conversión real, o se retiran esas opciones de los formularios hasta que el motor las soporte.

### C11 — MEDIO — Inconsistencia de escala decimal en tasas/porcentajes (ver B.4)
**Impacto:** truncamiento silencioso del 4° decimal al guardar en Postgres.
**Solución propuesta:** alinear el DTO a `maxDecimalPlaces: 3` o ampliar la columna a `decimal(8,4)`.

### C12 — MEDIO — Triplicación de la fórmula de saldo de mora pendiente (ver B.4)
**Impacto:** fragilidad de mantenimiento — un fix futuro en un solo lugar puede desincronizar los otros dos; hoy la función centralizada y probada (`sumarSaldoMoraPendiente`) es código muerto.
**Solución propuesta:** hacer que `prestamos.service.ts`, `pagos.service.ts` y `mora.cron.ts` importen y usen esa función en vez de reimplementar el SQL.

### C13 — MEDIO — No existe ningún mecanismo de anulación/reversión de un pago
**Evidencia:** `pagos.controller.ts` solo expone `GET`/`POST registrar` — grep de `anular|revertir|reversa` en el módulo → 0 resultados.
**Impacto:** un pago mal registrado no puede corregirse sin intervención manual directa en base de datos — sin rol asociado, sin reversa de caja/contabilidad, sin rastro de auditoría, porque la operación simplemente no existe.
**Solución propuesta:** ver sección D (es una funcionalidad ausente, no un bug en código existente) — se lista aquí también porque es el problema más mencionado por los cuatro informes de forma independiente.

### C14 — BAJO — Nivel de riesgo y frecuencia de decisión con mismatches menores de vocabulario (ver A.1, A.2)
Ya descritos arriba; de menor severidad porque no involucran dinero ni seguridad, solo UX rota puntual.

---

## D. Funcionalidades ausentes básicas para operar una financiera

Todo lo siguiente es ausencia de código, no bug — confirmado por grep exhaustivo en todo `src/prestamista` (y `src/declaraciones` donde aplica) sin resultados.

| Funcionalidad | Estado |
|---|---|
| **Anulación/reversión de un pago registrado** | No existe ningún endpoint ni lógica — solo `GET`/`POST registrar` en `pagos.controller.ts`. |
| **Liquidación anticipada total** | No existe un endpoint dedicado que calcule/confirme el saldo exacto de cierre; técnicamente se podría pagar el saldo total vía el endpoint normal de registrar pago, pero sin validación ni flujo dedicado. |
| **Abono extraordinario a capital con recálculo de amortización** | No existe — no hay forma de dirigir un pago directo a capital fuera del orden fijo mora→interés→capital, ni de regenerar la tabla de cuotas restante tras un abono. |
| **Consulta de buró de crédito / historial externo** | No existe — solo `scoreCredito` manual (entero 0-1000 tecleado a mano). |
| **Castigo de cartera / write-off de incobrables** | No existe ningún estado ni flujo de "incobrable" con su asiento de provisión. |
| **Reestructuración/renegociación independiente del refinanciamiento** | Solo existe vía refinanciamiento completo (crea un préstamo nuevo); no hay "ajuste de condiciones" sin cerrar/abrir un préstamo. |
| **Condonación de mora como flujo de aprobación propio** | Solo existe dentro de un refinanciamiento completo, sin segregación creador/aprobador (a diferencia de Solicitudes, que sí la tiene). |
| **Notificaciones automáticas de cuotas por vencer/vencidas** | No existe ningún cron de aviso — el único envío es manual, un préstamo a la vez (`notificarMora`). El cron de mora solo calcula, no notifica. |
| **Gestión de garantías con ciclo de vida** | Solo registro inicial; no hay tasación periódica, ni seguro para garantías no-vehiculares, ni liberación automática al pagar. |
| **Co-firmante / garante** | Tabla modelada (`pr_garantes`) sin ningún endpoint ni UI — 0% implementada más allá del esquema. |
| **Multi-moneda** | No existe — todos los montos son RD$ hardcodeado. |
| **Reportes regulatorios formales (provisión de incobrables)** | Existe la base (clasificación de cartera por antigüedad de mora), pero no hay cálculo de provisión ni reporte en formato regulatorio. |
| **Integración con Modo Supervisor** | Cero claves relacionadas a préstamos en el catálogo de Modo Supervisor (`supervisor-catalogo.ts`) — ninguna acción sensible (aprobar, desembolsar, condonar, refinanciar) tiene la fricción adicional de sesión/token que sí tienen las acciones de caja y venta del POS. |
| **Integración con Auditoría general** | Cero llamadas a `AuditoriaService` en todo el módulo — las acciones sensibles solo dejan rastro en columnas propias (`autorizadoPor`, `decididoPor`, `creadoPor`), sin changelog centralizado ni trazabilidad cruzada con otros módulos. |
| **Modificación de condiciones de un préstamo activo** | No existe ningún PATCH de tasa/plazo/mora fuera de cancelar o refinanciar completo. |
| **Comisiones reales (apertura, cobranza, otros cargos)** | Los campos existen (`cargoCierre`, `aplicadoCargos`) pero están completamente desconectados del flujo de dinero (ver C9). |

---

## E. Orden recomendado para corregir lo crítico

*(Recomendación de ingeniería — el usuario decide el orden final según prioridad de negocio.)*

1. **C2 — Arreglar "Aprobar/Rechazar solicitud".** Es el cuello de botella de todo el módulo: sin esto, nadie puede originar un préstamo nuevo desde la UI. Cambio pequeño y acotado (alinear vocabulario entre frontend/DTO).
2. **C3 — Arreglar el Simulador.** Cambio igualmente pequeño y acotado; sin él, el Simulador es una pantalla muerta.
3. **C1 — Agregar idempotencia a `POST /prestamista/pagos`.** Es dinero real duplicándose silenciosamente en producción cada vez que ocurre un doble clic o un reintento de red; el patrón a copiar ya existe en Facturas/Compras.
4. **C5 — Cerrar el gap multiempresa en desembolso directo y garantías.** Es exposición de datos de un tenant a otro — mismo tipo de severidad que los hallazgos de seguridad ya cerrados en auditorías previas (Super Admin, Agro, Prestamista C1-C5 anteriores).
5. **C4 — Hacer que el método "alemán" configurado en un producto realmente se use al desembolsar.** Es un error financiero silencioso: el cliente recibe una tabla distinta a la que el producto prometía, sin ningún aviso.
6. **C6 — Agregar asiento contable al refinanciamiento.** La condonación de mora/interés es una pérdida real que hoy no se refleja en ningún libro.
7. **C13 / D — Decidir si se construye anulación de pagos y liquidación anticipada.** Son ausencias de funcionalidad básica para operar, no bugs — requieren decisión de producto antes de implementación (qué rol puede anular, cómo se reversa contabilidad/caja/e-CF, si se exige supervisor).
8. **C7 — Decidir si el efectivo de préstamos debe integrarse al cierre de caja del POS.** Afecta el arqueo físico diario; es una decisión de producto con impacto operativo amplio, no solo técnico.
9. **El resto (C8-C12, C9-C10, D restante)** — deuda e inconsistencias menores que no comprometen dinero de forma activa hoy, pero conviene resolver antes de que el módulo crezca en volumen de uso real (nota: según memoria del proyecto, Prestamista tiene "casi sin datos" en producción al día de esta auditoría — es la ventana más barata para corregir esto antes de que haya más historial que migrar).

---

**No se implementó ningún cambio como parte de esta auditoría.** Toda corrección listada arriba requiere autorización explícita y separada antes de tocar código.
