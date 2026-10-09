# Motor Financiero — Prestamista Etapa 2, Fase 2A

**Estado:** revisado y cerrado el 2026-10-09. Las 8 decisiones abiertas de la primera versión quedaron resueltas (ver el resumen al final) — este documento ya refleja las respuestas, no las propuestas originales. Implementación en curso.
**Objetivo:** un solo motor puro (sin BD, sin efectos secundarios) que calcula la tabla de amortización completa a partir de un conjunto de parámetros. Lo usan el simulador, el desembolso, el refinanciamiento, los abonos y la mora — nada de cálculo financiero vive fuera de él.
**Convención de este documento:** cada fórmula está marcada como tal.

---

## 0. Forma del motor

Una función pura:

```
calcularTablaAmortizacion(parametros: ParametrosPrestamo) → TablaAmortizacion
```

```ts
interface ParametrosPrestamo {
  montoPrincipal: number;          // antes de cualquier cargo financiado
  frecuencia: Frecuencia;          // ver §1
  frecuenciaConfig?: FrecuenciaConfig;  // detalle de §1 según la frecuencia
  plazoPeriodos: number;           // reemplaza "plazoMeses" — ya no todos los períodos son meses
  fechaPrimerPago: string;         // 'YYYY-MM-DD'
  tasa: ParametrosTasa;            // ver §2
  metodo: MetodoAmortizacion;      // ver §3
  gracia?: ParametrosGracia;       // ver §4
  cargos?: Cargo[];                // ver §5
  cuotasPersonalizadas?: CuotaManual[]; // solo si metodo = 'personalizado'
}

interface TablaAmortizacion {
  tabla: LineaAmortizacion[];
  cuotaFija: number | null;        // null en métodos sin cuota constante (alemán, flat con cargos variables, personalizado)
  totalInteres: number;
  totalCargos: number;
  costoTotalCredito: number;       // §7
  totalAPagar: number;             // montoPrincipal + costoTotalCredito
  tasaEquivalentePorPeriodo: number; // §2
  tasaAnualNominal: number;          // §2
  tea: number;                       // §2 (nominal, sin TIR)
  teaReal: number;                   // §7, vía TIR sobre flujos reales (incluye cargos)
}

interface LineaAmortizacion {
  numeroCuota: number;
  fecha: string;
  capital: number;
  interes: number;
  cargos: { concepto: string; monto: number }[];
  cuotaTotal: number;               // capital + interes + suma(cargos)
  saldoRestante: number;
  esPeriodoGracia: boolean;
}
```

Esto es descriptivo (para fijar el vocabulario de las fórmulas), no el diseño final de la migración — eso va en la fase de implementación.

---

## 1. Frecuencias

```ts
type Frecuencia =
  | 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'bimestral'
  | 'trimestral' | 'semestral' | 'anual' | 'unico' | 'personalizado';
```

### 1.1 Generación de fechas, por frecuencia

En todos los casos, `fecha_1 = fechaPrimerPago` (la cuota 1 cae exactamente ahí; no se ajusta).

| Frecuencia | `fecha_k` (k = 1..n) |
|---|---|
| diaria | `fecha_1 + (k−1)` días, luego §1.2 (ajuste de día excluido) |
| semanal | `fecha_1 + (k−1)×7` días |
| quincenal (cada 15 días) | `fecha_1 + (k−1)×15` días |
| quincenal (días fijos 15/30) | ver §1.3 |
| mensual | mismo día del mes, `(k−1)` meses después — ver §1.4 (meses cortos) |
| bimestral | como mensual, paso de `2×(k−1)` meses |
| trimestral | como mensual, paso de `3×(k−1)` meses |
| semestral | como mensual, paso de `6×(k−1)` meses |
| anual | como mensual, paso de `12×(k−1)` meses |
| único | `n=1` fijo; `fecha_1` = la única fecha de pago (toda la deuda en una cuota) |
| personalizado | las fechas las da el usuario directamente — el motor no genera nada, solo valida que estén en orden y no se repitan |

### 1.2 Diaria — exclusión de domingos y feriados

```ts
interface FrecuenciaConfig_Diaria {
  excluirDomingos: boolean;
  excluirFeriados: boolean;
  feriados?: Set<string>; // 'YYYY-MM-DD', calendario de la empresa — ver §1.5
}
```

**[CERRADO]** Nunca se fusionan dos cuotas en una misma fecha — las fechas se generan como una secuencia estricta de días hábiles, cada cuota cae en el siguiente día hábil después de la **fecha ya ajustada** de la cuota anterior (no después del día "crudo"). Esto se generaliza a cualquier frecuencia: si el ajuste por día inhábil hiciera que dos cuotas coincidieran, la segunda se corre al próximo día hábil libre.

```
function esDiaHabil(fecha, config):
  return !(config.excluirDomingos && diaSemana(fecha) === 0)
      && !(config.excluirFeriados && config.feriados.has(fecha))

function primerDiaHabilDesde(fecha, config):     // inclusive: fecha misma si ya es hábil
  while !esDiaHabil(fecha, config): fecha += 1 día
  return fecha

function siguienteDiaHabilEstricto(fecha, config):   // EXCLUSIVO: siempre > fecha
  return primerDiaHabilDesde(fecha + 1 día, config)

// Generación, para cualquier frecuencia con exclusión de día activa:
fecha_1 = primerDiaHabilDesde(fechaPrimerPago, config)
para k = 2..n:
  candidato = fechaBaseSegúnFrecuencia(k)        // ancla + paso, según §1.1/1.3/1.4, SIN exclusión aún
  ajustado  = primerDiaHabilDesde(candidato, config)
  si ajustado <= fecha_{k-1}:
    ajustado = siguienteDiaHabilEstricto(fecha_{k-1}, config)
  fecha_k = ajustado
```

Para `diaria` con `excluirDomingos=true` y sin feriados, esto se reduce exactamente a "cada cuota es el día hábil siguiente al de la cuota anterior" (el paso de la fórmula base es de 1 día, así que el candidato de cada `k` siempre colisiona o ya es el día después del anterior). Con una racha de feriados consecutivos, el algoritmo simplemente sigue empujando hacia adelante hasta encontrar un día libre — nunca dos cuotas en la misma fecha, nunca una fecha hacia atrás.

Un préstamo de 30 cuotas diarias sin domingos tiene, por construcción, 30 fechas estrictamente distintas.

### 1.3 Quincenal — variante "días fijos" (15 y 30/fin de mes)

```ts
interface FrecuenciaConfig_Quincenal {
  modo: 'dias_fijos' | 'cada_15_dias';
}
```

Con `dias_fijos`: se genera la secuencia de "fechas de corte" (día 15 de cada mes, y el último día de cada mes) a partir del mes de `fechaPrimerPago`, se toman en orden cronológico, y se usan las primeras `n` que sean **≥ fechaPrimerPago**. Si `fechaPrimerPago` es exactamente el 15 o el último día del mes, esa misma fecha es `fecha_1`.

### 1.4 Mensual (y bimestral/trimestral/semestral/anual) — meses cortos

```
diaFijo = día(fechaPrimerPago)           // ej. 31
mesesAPaso = {mensual:1, bimestral:2, trimestral:3, semestral:6, anual:12}[frecuencia]
mesObjetivo = mes(fechaPrimerPago) + mesesAPaso × (k−1)   // con acarreo de año
díaReal = min(diaFijo, díasEnElMes(mesObjetivo))
fecha_k = (díaReal, mesObjetivo)
```

Ejemplo: `diaFijo=31`, frecuencia mensual → cuota de febrero cae el 28 (o 29 en bisiesto), la de abril el 30, la de marzo vuelve a caer el 31 (marzo sí tiene 31 días — **no se "arrastra" el recorte de febrero a los meses siguientes**, cada mes se evalúa con su propio número de días).

### 1.5 Calendario de feriados (RD), por empresa

Tabla nueva (`pr_feriados` o equivalente), editable desde Configuración, por empresa y por año.

**[CERRADO]** Al crear/abrir el calendario de un año, se precargan dos grupos:

1. **Feriados de fecha fija** (nunca se trasladan): 1 de enero (Año Nuevo), 21 de enero (Virgen de la Altagracia), 26 de enero (Día de Duarte), 24 de septiembre (Virgen de las Mercedes), 25 de diciembre (Navidad).
2. **Feriados de fecha móvil, calculados por algoritmo** (deterministas, no dependen de publicación oficial): Viernes Santo y Corpus Christi, derivados de la fecha de Pascua de ese año.

   Cómputo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano — determinista para cualquier año):
   ```
   a = año mod 19
   b = floor(año / 100);  c = año mod 100
   d = floor(b / 4);      e = b mod 4
   f = floor((b + 8) / 25)
   g = floor((b − f + 1) / 3)
   h = (19a + b − d − g + 15) mod 30
   i = floor(c / 4);      k = c mod 4
   l = (32 + 2e + 2i − h − k) mod 7
   m = floor((a + 11h + 22l) / 451)
   mes  = floor((h + l − 7m + 114) / 31)
   día  = ((h + l − 7m + 114) mod 31) + 1
   → (día, mes) = Domingo de Pascua
   ```
   ```
   Viernes Santo  = Pascua − 2 días
   Corpus Christi = Pascua + 60 días
   ```

3. **Los feriados que la Ley 139-97 traslada al lunes más cercano** (Día del Trabajo 1° mayo, Restauración 16 agosto, Constitución 6 noviembre) **NO se calculan** — el calendario oficial de cada año se publica por decreto y puede variar el criterio. Al abrir/crear el calendario de un año, la pantalla muestra un aviso: *"Verifica los feriados de [año] con el calendario oficial"*, con esas tres filas en blanco para que la empresa las complete. La tabla queda editable en cualquier momento (agregar, quitar, corregir cualquier fecha, incluidas las precargadas).

**[CERRADO]** Un feriado agregado o quitado del calendario **nunca reprograma cuotas ya generadas** — el calendario solo se consulta al momento de calcular la tabla de amortización de un préstamo nuevo (§10). Cambiar el calendario después no mueve ninguna fecha de un préstamo ya desembolsado.

---

## 2. Tasas

```ts
interface ParametrosTasa {
  valor: number;                 // tal cual lo captura el formulario
  periodoExpresado: 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'anual';
  tipo: 'nominal' | 'efectiva';
  baseDias: 360 | 365;           // solo afecta la conversión cuando periodoExpresado o frecuenciaPago = 'diaria'
}
```

### 2.1 Períodos por año (tabla fija)

**[CERRADO]**

| Período | períodos/año |
|---|---|
| semanal | 52 |
| quincenal | 24 |
| mensual | 12 |
| bimestral | 6 |
| trimestral | 4 |
| semestral | 2 |
| anual | 1 |

De semanal en adelante, conteos de calendario fijos — no se recalculan a partir de `baseDias`. Para **diaria**, en cambio, la tasa diaria sale directamente de la base de días configurada (`baseDias`, 360 o 365), no de un número fijo de "períodos de un día al año" — ver §2.4, que generaliza la fórmula. Los días excluidos por `excluirDomingos`/`excluirFeriados` (§1.2) afectan únicamente **qué días tienen cuota**, nunca la tasa: la tasa diaria es la misma tanto si ese día cae domingo como si no.

### 2.2 Conversión: tasa ingresada → tasa del período de pago (frecuencias semanal a anual)

Aplica cuando `frecuenciaPago` es semanal, quincenal, mensual, bimestral, trimestral, semestral o anual — es decir, cuando hay un número fijo de períodos al año (§2.1). Para diaria/único/personalizado, ver §2.4.

Sea `m = periodosPorAño(periodoExpresado)` y `p = periodosPorAño(frecuenciaPago)`.

**Si `tipo = 'nominal'`** (proporcional simple, "dividir por períodos del año"):
```
tasaAnualNominal = valor × m
tasaPeriodoPago  = tasaAnualNominal ÷ p  =  valor × (m ÷ p)
```

**Si `tipo = 'efectiva'`** (capitalización compuesta):
```
tasaAnualEfectiva = (1 + valor)^m − 1
tasaPeriodoPago   = (1 + tasaAnualEfectiva)^(1/p) − 1  =  (1 + valor)^(m/p) − 1
```

### 2.3 Qué se muestra siempre en pantalla

```
tasaEquivalentePorPeriodo = tasaPeriodoPago                              (de §2.2)
tasaAnualNominal          = tasaPeriodoPago × p
tea (TEA nominal)         = (1 + tasaPeriodoPago)^p − 1
```

`tea` aquí es la TEA derivada directamente de la tasa configurada (antes de cargos). La **TEA real** (con cargos, vía TIR) se calcula en §7 y es un número distinto — ambos se muestran, con esa distinción explicada en la UI para que no se confundan.

Para `diaria`/`único`/`personalizado` (§2.4), la pantalla muestra el equivalente usando `tasaDiaria`: `tasaAnualNominal = tasaDiaria × baseDias`, `tea = (1 + tasaDiaria)^baseDias − 1`.

### 2.4 Tasa diaria — para `diaria`, `único` y `personalizado`

**[CERRADO]** Estas tres frecuencias no tienen un "período de pago" de duración fija (en `diaria` el intervalo real entre cuotas varía según cuántos domingos/feriados se salten; en `único`/`personalizado`, por diseño). El interés se calcula por **días reales transcurridos**, sobre una tasa diaria derivada de `baseDias` (360 o 365):

```
tasaAnualNominal = valor × periodosPorAño(periodoExpresado)      // si tipo='nominal' (§2.2, mismo primer paso)
tasaAnualEfectiva = (1 + valor)^periodosPorAño(periodoExpresado) − 1   // si tipo='efectiva'

tasaDiaria =
  tasaAnualNominal / baseDias                      si tipo='nominal'
  (1 + tasaAnualEfectiva)^(1/baseDias) − 1          si tipo='efectiva'

interes_k = saldo_{k−1} × tasaDiaria × díasReales(fecha_{k−1}, fecha_k)
```

donde `díasReales(a, b)` son los días de calendario reales entre las dos fechas (para la cuota 1, entre la fecha de desembolso y `fecha_1`). Esta es la misma fórmula para los tres casos — lo único que cambia es de dónde salen las fechas: generadas con exclusión de día (`diaria`, §1.2), dadas una por una por el operador (`único` tiene una sola; `personalizado` las que se definan).

**Importante — por qué `diaria` NO usa esta fórmula para las frecuencias regulares (semanal...anual):** en esas frecuencias, la tasa por período (§2.2) es FIJA y se aplica una vez por cuota sin importar cuántos días de calendario tenga ese período exacto — igual que hoy una cuota mensual no se ajusta porque el mes tenga 28 o 31 días. En `diaria`, en cambio, como cada cuota corresponde a un solo día pero el intervalo real entre cuotas varía (1 día normalmente, 2+ si se saltó un domingo/feriado), el interés de cada cuota debe reflejar ese intervalo real — de lo contrario, el interés de los días saltados simplemente se perdería. Por eso `diaria` usa días reales mientras que el resto de frecuencias regulares no.

---

## 3. Métodos de amortización

```ts
type MetodoAmortizacion =
  | 'frances' | 'aleman' | 'americano' | 'flat'
  | 'solo_interes_luego_amortiza' | 'personalizado';
```

En todos los métodos (salvo `personalizado`), la **última cuota** se ajusta para cerrar el saldo en cero exacto — se detalla en §7.3.

Sea `P` = `montoPrincipal` (ya incluyendo cualquier cargo financiado, ver §5), `n` = `plazoPeriodos`, e `i` = `tasaPeriodoPago` (§2.2) para las frecuencias regulares (semanal a anual) — **un valor constante, igual en todos los períodos**.

**[CERRADO] Caso `diaria` (con exclusión de domingo/feriado activa), `único` y `personalizado`:** en estos tres casos `i` no es constante — el `interes_k` de cada período se calcula con la fórmula de §2.4 (`saldo_{k−1} × tasaDiaria × díasReales`), no con un `i` fijo. Donde las fórmulas de abajo usan `cuotaFija`/`capitalFijo` (francés, alemán, flat), ese valor se calcula **una sola vez** con `i = tasaDiaria` tratado como si cada período fuera exactamente un día (es decir, con la fórmula de cuota fija de la frecuencia regular, usando `tasaDiaria` en el lugar de `i`), y luego el `interes_k` real de cada cuota (que varía según el intervalo real) se resta de esa misma `cuotaFija` constante para obtener `capital_k` — igual que en frecuencia regular, solo que ahora `interes_k` no es idéntico cuota a cuota. Esto hace que la cuota sea **nominalmente fija pero el reparto capital/interés varíe levemente** cuando un intervalo abarca un domingo/feriado (más interés ese período, menos capital) — la última cuota sigue cerrando el saldo en cero exacto (§7.3), igual que en cualquier otro caso.

### 3.1 Francés (cuota fija)

Igual que el motor actual, generalizado a cualquier `n`/`i`:

```
cuotaFija = P × i(1+i)^n / ((1+i)^n − 1)      si i > 0
cuotaFija = P / n                              si i = 0

por período k = 1..n:
  interes_k = saldo_{k−1} × i
  capital_k = cuotaFija − interes_k     (k < n)
  saldo_k   = saldo_{k−1} − capital_k
```

### 3.2 Alemán (capital fijo)

```
capitalFijo = P / n

por período k = 1..n:
  interes_k    = saldo_{k−1} × i
  capital_k    = capitalFijo             (k < n)
  cuotaTotal_k = capital_k + interes_k
  saldo_k      = saldo_{k−1} − capital_k
```

### 3.3 Americano (bullet — solo interés + capital al final)

```
por período k = 1..n−1:
  interes_k = saldo_{k−1} × i  =  P × i   (el saldo nunca baja)
  capital_k = 0
  cuotaTotal_k = interes_k

período n (última):
  capital_n = P
  interes_n = P × i
  cuotaTotal_n = P + interes_n
```

### 3.4 Interés flat (fijo sobre el monto original)

El uso habitual en préstamos informales: el interés se calcula UNA VEZ sobre el monto original, no sobre saldo decreciente.

```
interesTotal = P × i × n
cuotaFija    = (P + interesTotal) / n   =   P/n  +  P×i

por período k = 1..n:
  capital_k = P / n                      (constante, k < n)
  interes_k = P × i                      (constante — NO sobre saldo, SIEMPRE sobre P)
  cuotaTotal_k = capital_k + interes_k  (constante)
```

El "saldo" que se muestra en la tabla es puramente informativo (`saldo_k = saldo_{k−1} − capital_k`): a diferencia de los otros métodos, el interés de este método **no depende de ese saldo**.

### 3.5 Solo interés por N períodos, luego amortización

```ts
interface ParametrosSoloInteres {
  periodosSoloInteres: number;              // "N"
  metodoPosterior: 'frances' | 'aleman';    // ver §4.1 — es el MISMO mecanismo que la gracia de capital
}
```

```
por período k = 1..N:
  interes_k = P × i
  capital_k = 0
  saldo_k   = P                            (no cambia)

por período k = N+1..n:
  se aplica §3.1 (francés) o §3.2 (alemán) sobre (n−N) períodos, con saldo inicial = P
```

**Nota de diseño:** este método es exactamente la **gracia de capital** (§4.1) aplicada desde el período 1, con el método base elegido para el resto del plazo. No se implementa dos veces — en el motor es un caso particular de "gracia de capital con `periodosGracia = N`", documentado aquí como método independiente porque así lo pediste, pero la Fase 2A lo construye reutilizando el mecanismo de §4.1.

### 3.6 Cuotas personalizadas

El operador define, a mano, los montos y fechas de cada cuota (`CuotaManual[] = {fecha, montoTotal}[]`). El motor NO genera montos — solo calcula la partición capital/interés de cada cuota dada, y valida que el préstamo cierre en cero:

```
por período k = 1..n (en el orden de las fechas dadas):
  interes_k = saldo_{k−1} × tasaDiaria × díasReales(fecha_{k−1}, fecha_k)    // §2.4
  capital_k = montoTotal_k − interes_k
  saldo_k   = saldo_{k−1} − capital_k

validación: saldo_n debe ser 0 (±1 centavo de tolerancia por redondeo) — si no,
  error de validación ANTES de guardar nada: "las cuotas definidas no cierran
  el préstamo; falta/sobra RD$X".
```

**[CERRADO]**: si `capital_k` resultara negativo (la cuota dada no cubre ni el interés del tramo), se **rechaza con error explícito** — sin amortización negativa. Una cuota personalizada que no cubre su propio interés casi siempre es un error de captura, no una intención real.

---

## 4. Períodos de gracia

```ts
interface ParametrosGracia {
  tipo: 'capital' | 'total';
  periodos: number;
  // Solo aplica si tipo='total'. Configurable por producto. Default: 'prorratea'.
  tratamientoInteresGracia?: 'prorratea' | 'capitaliza' | 'primera_cuota';
}
```

### 4.1 Gracia de capital

Durante los primeros `G = periodos` períodos, solo se paga interés (igual que §3.5):

```
por período k = 1..G:
  interes_k = saldo_{k−1} × i  =  P × i
  capital_k = 0
  saldo_k   = P

por período k = G+1..n:
  se aplica el método elegido (francés/alemán/americano/flat) sobre (n−G) períodos,
  con saldo inicial = P
```

### 4.2 Gracia total — tratamiento del interés generado durante la gracia

**[CERRADO]** Durante los primeros `G` períodos no se paga nada. El saldo de capital se mantiene en `P` (no crece) en los tres tratamientos salvo que se indique lo contrario — lo que cambia es **qué pasa con el interés generado en esos `G` períodos**, configurable por producto:

```
interesGraciaTotal = P × i × G     (simple — suma del interés de cada uno de los G períodos sobre P)

por período k = 1..G (los tres tratamientos):
  interes_k = 0   (no se cobra en el período; queda registrado en interesGraciaTotal)
  capital_k = 0
```

**`capitaliza`**: el interés se suma al saldo cada período (interés compuesto sobre el tramo de gracia) — el deudor termina pagando intereses sobre intereses del período de gracia.
```
saldoDespuésDeGracia = P × (1 + i)^G
por período k = G+1..n: se aplica el método elegido sobre (n−G) períodos,
  con saldo inicial = saldoDespuésDeGracia (el "P" de §3 pasa a ser este valor)
```

**`prorratea`** (default): el saldo de capital no crece; `interesGraciaTotal` se reparte en partes iguales sobre las `(n−G)` cuotas restantes, sumado a la cuota normal de cada una.
```
cargoGraciaPorCuota = interesGraciaTotal / (n − G)
por período k = G+1..n: se aplica el método elegido sobre (n−G) períodos, saldo inicial = P;
  cuotaTotal_k += cargoGraciaPorCuota
```

**`primera_cuota`**: el saldo de capital no crece; todo `interesGraciaTotal` se cobra de una sola vez, sumado a la primera cuota después de la gracia (período `G+1`) — es lo habitual para que el cargo quede cobrado aunque el préstamo se liquide anticipadamente poco después de la gracia.
```
por período k = G+1..n: se aplica el método elegido sobre (n−G) períodos, saldo inicial = P;
  cuotaTotal_{G+1} += interesGraciaTotal   (solo en esa cuota)
```

La diferencia económica entre `capitaliza` y los otros dos es real y debe quedar visible en el total a pagar: `capitaliza` genera más interés total (interés sobre interés); `prorratea` y `primera_cuota` cobran el mismo `interesGraciaTotal`, solo distribuido distinto en el tiempo.

### 4.3 Gracia de mora (ya existe, sin cambios)

`diasGracia` en `pr_prestamos`, usado por `clasificarMorosidad()`/`mora.cron.ts` (Etapa 1) — no se toca en esta fase.

---

## 5. Cargos

```ts
interface Cargo {
  concepto: string;                          // libre, para mostrar en la cuota/recibo
  tipo: 'fijo' | 'porcentaje';
  monto: number;                             // valor absoluto si tipo='fijo'; % si tipo='porcentaje' (ej. 2 = 2%)
  momento: 'desembolso' | 'por_cuota' | 'unico_diferido';
  tratamientoDesembolso?: 'descontado' | 'financiado' | 'aparte';  // solo si momento='desembolso'
  baseFiscal: ConfigFiscalConcepto;           // §8 — vacío por defecto
}
```

### 5.1 Cargos al desembolso (comisión de apertura, gastos administrativos)

Monto del cargo: `montoCargo = tipo==='fijo' ? monto : montoPrincipalOriginal × monto/100`.

- **`descontado`**: el deudor recibe `montoPrincipalOriginal − montoCargo` en efectivo/transferencia, pero el saldo de capital registrado (`P` en todas las fórmulas de §3) sigue siendo `montoPrincipalOriginal` — paga intereses sobre el monto completo aunque recibió menos.
- **`financiado`**: se SUMA al principal: `P = montoPrincipalOriginal + montoCargo` — el deudor paga intereses también sobre el cargo, a lo largo de todo el plazo.
- **`aparte`**: se cobra como un cargo/documento separado al momento del desembolso, fuera de la tabla de amortización; `P = montoPrincipalOriginal` sin ajuste, el deudor recibe el monto completo.

### 5.2 Cargos por cuota (seguro, otros)

Se SUMAN a cada `cuotaTotal_k` ya calculada por el método base, sin afectar la partición capital/interés:

```
montoCargoPorCuota = tipo==='fijo' ? monto : saldo_{k-1} × monto/100   // % sobre saldo si aplica (ej. seguro de saldo deudor)
cuotaTotal_k += montoCargoPorCuota
```

### 5.3 Cargo único diferido

Un monto fijo o % que se cobra una sola vez, para cargos que no son ni "al desembolso" ni "recurrentes" (ej. un cargo de cierre de expediente). **[CERRADO]**: configurable por cargo —

```ts
momentoUnicoDiferido: 'primera_cuota' | 'ultima_cuota' | 'prorrateado';   // default: 'primera_cuota'
```

Default `primera_cuota`: es lo habitual para cargos de apertura/administrativos, y evita que el cargo quede sin cobrar si el préstamo se liquida antes de llegar a la última cuota.

---

## 6. Mora

```ts
interface ParametrosMora {
  base: 'capital_vencido' | 'cuota_vencida' | 'monto_fijo';
  tasaOMonto: number;              // % mensual si base≠'monto_fijo'; monto en pesos si base='monto_fijo'
  periodoMontoFijo?: 'dia' | 'cuota';  // solo si base='monto_fijo'
  topeMora?: { tipo: 'monto' | 'porcentaje_saldo'; valor: number };
  baseDiasMora: 360 | 365;
  diasGracia: number;               // ya existe
}
```

- **`capital_vencido`**: la mora se calcula sobre el CAPITAL vencido de la cuota (no sobre capital+interés, a diferencia de hoy) — `saldoBase = capitalPendienteDeLaCuota`.
- **`cuota_vencida`**: igual que el motor de hoy — `saldoBase = capitalPendiente + interesPendiente` de la cuota.
- **`monto_fijo`**: no depende del saldo — `mora = montoFijo × díasDeAtraso` (si `periodoMontoFijo='dia'`) o `mora = montoFijo` una sola vez por cuota vencida (si `periodoMontoFijo='cuota'`, sin importar cuántos días lleve).

**[CERRADO]** Para los dos primeros, la tasa diaria de mora NO usa los días del mes en curso (eso haría que la tasa diaria cambiara según caiga en febrero o en marzo, difícil de explicar al cliente) — usa una base fija, elegida al configurar el producto:

```
tasaDiaria = baseDiasMora === 360
  ? (tasaOMonto / 100) / 30            // base comercial — igual que hoy (Etapa 1)
  : (tasaOMonto / 100) × 12 / 365      // ACT/365 — tasa mensual anualizada ÷ 365

mora = redondearDinero(saldoBase × tasaDiaria × díasDeAtraso)
```

El conteo de `díasDeAtraso` sigue siendo siempre días de calendario reales (sin cambios de Etapa 1) — lo que cambia según `baseDiasMora` es solo cómo se deriva la tasa diaria a partir de la tasa mensual configurada, no el conteo de días vencidos.

**Tope**: después de calcular `mora` con la fórmula de arriba, si hay `topeMora`:

```
limite = topeMora.tipo==='monto' ? topeMora.valor : saldoBase × topeMora.valor/100
mora   = min(mora, limite)
```

**Se mantiene** (Etapa 1, sin cambios): el trinquete (`moraGenerada` solo crece, nunca baja) y los días de gracia para mora.

---

## 7. Precisión

### 7.1 Decimal.js vs. enteros en centavos — decisión y justificación

**Propuesta: Decimal.js dentro del motor puro; `number` redondeado a 2 decimales en la frontera de salida.**

Razones:
- El resto del ERP (Facturas, Compras, Nómina, Caja) usa `number` (float64) + redondeo por paso (`r2()`), y las columnas de Postgres son `decimal` exacto en el storage — cambiar el TIPO que cruza hacia el resto del sistema introduciría una inconsistencia en los límites (serialización JSON, comparaciones en otros módulos, reportes) sin necesidad.
- El riesgo real de `number` + redondeo por paso es el caso borde de IEEE-754 (un valor que matemáticamente es `x.xx5` pero el float lo representa como `x.xx49999...`, haciendo que `Math.round` redondee para el lado equivocado) — la auditoría de Etapa 1 lo señaló como "fragilidad arquitectónica, baja probabilidad pero no nula". Con un motor que ahora calcula muchas más combinaciones (más frecuencias, más métodos, tasas efectivas con exponentes fraccionarios), la probabilidad de tropezar con ese borde sube.
- Decimal.js dentro del motor (cálculos intermedios en aritmética decimal exacta, nunca en binario) elimina ese riesgo donde más combinaciones nuevas lo pueden disparar, sin tocar el tipo de dato que ya usa el resto del sistema: el motor convierte a `number` redondeado a 2 decimales **solo al construir la `LineaAmortizacion` de salida**.
- Alternativa descartada: enteros en centavos. Más rápido y sin ambigüedad de redondeo, pero exige reescribir cada fórmula para trabajar en enteros (una tasa efectiva con exponente fraccionario, por ejemplo, no tiene una representación entera limpia — igual habría que pasar por decimales en algún punto del cálculo de la tasa). No ofrece una ventaja clara sobre Decimal.js para el volumen de datos de este módulo.

### 7.2 Una sola función de redondeo

```ts
// dinero.util.ts — ÚNICA función de redondeo monetario de todo el módulo Prestamista
function redondearDinero(n: Decimal | number): number {
  return new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
```

`ROUND_HALF_UP` para ser consistente con el comportamiento actual (`Math.round` ya redondea "half up" para valores positivos, que es lo único que existe en este dominio — no hay montos negativos).

Como parte de la Fase 2A, `r2()` (Etapa 1, `mora.util.ts`) se deprecia en favor de `redondearDinero()` para todo el código NUEVO; el código de la Etapa 1 que ya usa `r2()` no se toca en esta fase (no está roto, y tocarlo sin necesidad no está en el alcance pedido) — queda documentado como deuda a unificar cuando se migre ese código al motor nuevo.

### 7.3 Ajuste de la última cuota

Regla única, aplicada después de generar la tabla con la fórmula del método (§3) más gracia/cargos (§4-5):

```
capital_n = saldo_{n−1}                      // fuerza el cierre exacto en cero
interes_n = (según la fórmula normal del método para el período n)
cuotaTotal_n = capital_n + interes_n + cargos_n
saldo_n = 0
```

Esto es exactamente lo que ya hace el motor de Etapa 1 (francés/alemán), generalizado a todos los métodos nuevos. En `americano`, esta regla y la regla propia del método (§3.3) coinciden (ambas ponen `capital_n = P`). En `flat`, puede generar que la última cuota no sea idéntica a las demás por el residuo de redondeo acumulado — mismo fenómeno ya documentado en la auditoría de Etapa 1 para francés/alemán, y la misma solución (se acepta, se documenta).

### 7.4 Costo total del crédito, total de intereses, TEA real

```
totalInteres        = Σ interes_k  (k=1..n)
totalCargos         = Σ (cargos de cada cuota) + cargos de desembolso que el deudor efectivamente paga
                        (incluye la comisión "descontada": el deudor la paga aunque no pase por ninguna cuota)
costoTotalCredito   = totalInteres + totalCargos
totalAPagar         = montoPrincipalOriginal + costoTotalCredito
```

**TEA real (vía TIR):** se construye el flujo de caja real del préstamo —

```
flujo[0]     = −(montoPrincipalOriginal − cargoDescontado)   // lo que el deudor realmente recibe en efectivo
flujo[fecha_k] = cuotaTotal_k   (k = 1..n, incluye cargos por cuota)
```

y se resuelve `TIR_periodo` tal que `Σ flujo_t / (1+TIR_periodo)^t = 0` (con `t` en unidades del período de pago, usando los días reales entre fechas para frecuencias irregulares). Método numérico: bisección sobre un rango amplio (`−0.99` a `10`, es decir -99% a 1000% por período), tolerancia `1e-10`, máximo 200 iteraciones — más lento que Newton-Raphson pero no requiere derivada y nunca diverge, preferible para un motor que debe ser robusto ante cualquier combinación de parámetros.

```
teaReal = (1 + TIR_periodo)^periodosPorAño(frecuenciaPago) − 1
```

---

## 8. Fiscal — configuración vacía por producto/concepto

No se decide ningún tratamiento fiscal en esta fase. Estructura (por producto, por concepto: `interes`, `mora`, `apertura`, `gastos`, `seguro`, y una fila por cada cargo "otro" definido):

```ts
interface ConfigFiscalConcepto {
  generaComprobante: boolean | null;    // default: null (sin definir)
  tipoEcf: string | null;               // default: null
  tratamientoItbis: 0 | 16 | 18 | 'exento' | null;  // default: null
}
```

Toda fila nace con los tres campos en `null`/sin definir. La implementación de Fase 2A deja la UI para que los definas producto por producto antes de que cualquier concepto genere un comprobante — ningún valor se asume.

---

## 9. Tests matemáticos

La matriz completa (6 métodos × 10 frecuencias × 2 tipos de tasa × 3 variantes de gracia × con/sin cargos) son cientos de combinaciones — no es razonable un caso de referencia calculado a mano para cada una. Dos capas:

### 9.1 Casos canónicos (tabla de referencia independiente, calculada a mano o con PMT/IPMT/PPMT de Excel, verificada en el test)

Como mínimo, uno de cada método/variante, todos con RD$100,000, 12 períodos, 3%/período, mensual, sin cargos salvo donde se indique:
1. Francés, mensual, nominal, sin gracia — ya cubierto en Etapa 1, se migra al motor nuevo con el mismo caso de referencia.
2. Alemán, mensual, nominal, sin gracia — idem.
3. Americano, mensual.
4. Flat, mensual.
5. Francés con gracia de capital (3 períodos).
6. Francés con gracia total — `capitaliza` (3 períodos).
7. Francés con gracia total — `prorratea` (3 períodos).
8. Francés con gracia total — `primera_cuota` (3 períodos) — verificar que la cuota `G+1` lleva el cargo completo y las demás no.
9. Francés quincenal (días fijos) — fechas verificadas a mano contra un calendario real.
10. Francés con tasa efectiva (en vez de nominal) — verificar que la tasa por período convertida coincide con el cálculo manual de §2.2.
11. Diaria con exclusión de domingos — sobre un rango que cruce al menos dos domingos, fechas Y montos de interés verificados a mano (el interés de la cuota que sigue a un domingo debe duplicar el de un día normal — §2.4).
12. Pago único — interés por días reales entre desembolso y la fecha de pago, verificado a mano.
13. Un caso con cargo de apertura financiado, uno descontado, uno aparte — verificar que `P` y el monto recibido por el deudor sean los esperados en cada uno.
14. Mora con cada una de las tres bases (`capital_vencido`, `cuota_vencida`, `monto_fijo`), con y sin tope, y con `baseDiasMora` en 360 y en 365 (verificar que la tasa diaria efectiva de 365 es `×12/365`, distinta de `/30`).
15. Cálculo de Pascua: verificar el algoritmo de §1.5 contra fechas conocidas de Viernes Santo/Corpus Christi de al menos 3 años distintos (valores públicos, fáciles de verificar independientemente).

### 9.2 Tests de propiedades, sobre TODA la matriz de combinaciones válidas (generadas, no una por una a mano)

Para cada combinación generada automáticamente:
- `Σ capital_k = montoPrincipal` (el `P` efectivo, tras cargos financiados) — exacto, sin residuo.
- `saldo_n = 0` exacto.
- Ninguna `cuota_k`, `capital_k` ni `interes_k` es negativa (salvo que se permita explícitamente en `personalizado`, §3.6).
- `fecha_k` estrictamente creciente, sin duplicados salvo el caso documentado en §1.2.
- Sin pérdida de centavos: `Σ cuotaTotal_k = montoPrincipal + totalInteres + totalCargos` (identidad exacta, no aproximada).

### 9.3 Tests de fechas específicos

- Fin de mes: `diaFijo=31`, verificar febrero (28 y 29 — dos años distintos), abril/junio/septiembre/noviembre (30).
- Año bisiesto: un plazo que cruce 29 de febrero.
- Diaria: una racha de 2+ feriados consecutivos (verificar que el ajuste de §1.2 no colapsa fechas de forma inesperada).
- Quincenal "días fijos": un plazo que cruce diciembre→enero (fin de año).

**Regla general: ningún caso sin test** — se interpreta como: todo método, toda variante de gracia y todo tratamiento de cargo tiene al menos un test con valores numéricos verificados (no solo "no lanza error").

---

## 10. Compatibilidad con el préstamo existente (empresa 55)

El préstamo activo de la empresa 55 se creó con el motor de Etapa 1 (`amortizacion.util.ts`, francés/alemán, mensual, sin gracia, sin cargos) y su tabla de cuotas (`pr_cuotas`) ya está **guardada** en la base de datos. Verificado en el código:

- `PagosService.registrar()` y `PrestamosService.recalcularSaldos()` **leen** `pr_cuotas` — nunca vuelven a llamar a `calcularAmortizacion()` sobre un préstamo ya desembolsado.
- El único punto que ejecuta el motor es `PrestamosService.crearEnTransaccion()` (desembolso) y `RefinanciamientoService.refinanciarEnTransaccion()` (préstamo nuevo del refinanciamiento) — ambos solo corren al MOMENTO de crear un préstamo, nunca después.

Conclusión: el préstamo de la empresa 55 sigue funcionando sin ningún cambio — el motor nuevo se conecta únicamente en los puntos de creación (desembolso directo, desembolso desde solicitud, préstamo nuevo de un refinanciamiento), para préstamos que se creen de aquí en adelante. No hace falta ninguna migración de datos para los préstamos ya existentes.

---

## Resumen de decisiones (cerradas el 2026-10-09)

| § | Decisión | Resuelto como |
|---|---|---|
| 1.2 | Cuotas que colapsan en la misma fecha | Nunca se fusionan — secuencia estricta de días hábiles, cada cuota = siguiente día hábil después de la fecha **ajustada** de la anterior |
| 1.5 | Feriados de fecha variable | Viernes Santo/Corpus Christi se calculan por algoritmo (fecha de Pascua); los trasladados al lunes (Ley 139-97) quedan en blanco con aviso para que la empresa los confirme cada año; nunca reprograma cuotas ya generadas |
| 2.1 | Períodos/año fijos por calendario | Sí, fijos (52/24/12/6/4/2/1) para semanal en adelante; diaria sale directo de `baseDias` |
| 2.4 | Tasa e interés para `diaria`/`único`/`personalizado` | Por días reales: `saldo × tasaDiaria × díasReales`, con `tasaDiaria` derivada de `baseDias` |
| 3.6 | Capital negativo en una cuota personalizada | Se rechaza con error, sin amortización negativa |
| 4.2 | Tratamiento del interés en gracia total | Configurable por producto: `prorratea` (default) / `capitaliza` / `primera_cuota` |
| 5.3 | Cuota donde cae un cargo "único diferido" | Configurable: `primera_cuota` (default) / `ultima_cuota` / `prorrateado` |
| 6 | Base de días para mora | `360`: tasa mensual ÷ 30 (como hoy). `365`: tasa mensual × 12 ÷ 365 (ACT/365) — nunca días del mes en curso |

Implementación en curso sobre esta versión del documento.
