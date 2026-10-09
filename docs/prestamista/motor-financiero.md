# Motor Financiero — Prestamista Etapa 2, Fase 2A

**Estado:** propuesta para revisión. No se ha escrito código todavía.
**Objetivo:** un solo motor puro (sin BD, sin efectos secundarios) que calcula la tabla de amortización completa a partir de un conjunto de parámetros. Lo usan el simulador, el desembolso, el refinanciamiento, los abonos y la mora — nada de cálculo financiero vive fuera de él.
**Convención de este documento:** cada fórmula está marcada como tal. Donde el encargo deja más de una interpretación razonable, lo marco explícitamente con **[DECISIÓN ABIERTA]** y propongo un default — se implementa con ese default solo si no lo cambias.

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

**Regla (convención *forward*, igual a la que usan los calendarios bancarios):**

```
function fechaAjustada(fecha, config):
  while (config.excluirDomingos && diaSemana(fecha) === 0)
      || (config.excluirFeriados && config.feriados.has(fecha)):
    fecha = fecha + 1 día
  return fecha
```

Cada `fecha_k` se calcula primero como `fecha_1 + (k−1)` días **sin acumular ajustes de las anteriores**, y luego se le aplica `fechaAjustada()` de forma independiente. Esto evita que una racha de feriados consecutivos haga que dos cuotas distintas colapsen en el mismo día: cada una se ajusta desde su propia fecha "cruda", no desde la fecha ajustada de la cuota anterior.

**[DECISIÓN ABIERTA]** Si dos cuotas "crudas" distintas, tras el ajuste, terminan cayendo en el mismo día (posible solo con rachas de feriados largas y una cuota diaria), el motor lo deja así (dos cuotas con la misma fecha de vencimiento) salvo que prefieras que se fusionen o se corra la segunda un día más. Propongo dejarlo así por defecto — es un caso extremo y fusionar cuotas automáticamente es más sorprendente que dos fechas iguales.

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

Tabla nueva, editable desde Configuración, con un set precargado de feriados oficiales dominicanos y la posibilidad de agregar/quitar fechas por empresa (para feriados locales, cierres excepcionales, etc.).

**[DECISIÓN ABIERTA — verificación legal, no solo de diseño]** La Ley 139-97 traslada algunos feriados dominicanos al lunes siguiente si caen en medio de semana, pero **no todos**: de memoria, Año Nuevo (1 ene), Día de la Altagracia (21 ene), Día de Duarte (26 ene), Día de las Mercedes (24 sep) y Navidad (25 dic) son de fecha **fija** (no se trasladan); Día del Trabajo (1 may), Restauración (16 ago) y Constitución (6 nov) sí se trasladan al lunes; Viernes Santo y Corpus Christi dependen de la fecha de Pascua de cada año (cómputo astronómico/litúrgico, no fijo). No voy a precargar fechas específicas de años futuros sin que las confirmes — el riesgo de equivocarme en un detalle legal es real y el costo de un feriado mal cargado (una cuota "diaria" que cae en un día que debía excluirse) es dinero mal fechado. Propongo:
- Precargar solo los feriados de **fecha fija** (los 5 de arriba) para el año en curso y el siguiente.
- Dejar Viernes Santo/Corpus Christi/los de "lunes más cercano" como filas que tú completas o confirmas antes de que el motor los use en producción.
- La tabla es editable en cualquier momento — un error se corrige sin tocar código.

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

| Período | períodos/año |
|---|---|
| diaria | `baseDias` (360 o 365) |
| semanal | 52 |
| quincenal | 24 |
| mensual | 12 |
| bimestral | 6 |
| trimestral | 4 |
| semestral | 2 |
| anual | 1 |

**[DECISIÓN ABIERTA]** Esta tabla usa conteos de calendario fijos (52 semanas, 24 quincenas, etc.) para TODAS las frecuencias excepto diaria — `baseDias` (360/365) solo entra en juego para convertir hacia o desde una tasa diaria. Es la convención que ya usa el motor actual (mes comercial de 30 días para mora) y la más simple de razonar; la alternativa (recalcular períodos/año como `baseDias ÷ díasReales del período`) agrega complejidad sin un beneficio claro para préstamos de consumo. Lo dejo así salvo que prefieras lo segundo.

### 2.2 Conversión: tasa ingresada → tasa del período de pago

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

### 2.4 Caso `único`/`personalizado`

No hay "período de pago" fijo que convertir. **[DECISIÓN ABIERTA]**: para `único`, `tasaPeriodoPago` = la tasa efectiva del único período completo entre desembolso y la fecha de pago (se calcula igual que §2.2 tratando ese tramo como "el período de pago", vía la fórmula efectiva con `p` = períodos/año implícitos en los días reales de ese tramo). Para `personalizado`, cada tramo entre cuotas puede tener distinta duración — se recomienda exigir una `tasaPeriodoPago` ya resuelta por período (no una conversión automática), dado que "personalizado" ya implica que el operador define todo a mano.

---

## 3. Métodos de amortización

```ts
type MetodoAmortizacion =
  | 'frances' | 'aleman' | 'americano' | 'flat'
  | 'solo_interes_luego_amortiza' | 'personalizado';
```

En todos los métodos (salvo `personalizado`), la **última cuota** se ajusta para cerrar el saldo en cero exacto — se detalla en §7.3.

Sea `P` = `montoPrincipal` (ya incluyendo cualquier cargo financiado, ver §5), `i` = `tasaPeriodoPago`, `n` = `plazoPeriodos`.

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
  interes_k = saldo_{k−1} × i_k     // i_k: la tasa del tramo k (si la frecuencia es irregular, i_k se deriva de los días reales entre fecha_{k-1} y fecha_k — ver §2.4)
  capital_k = montoTotal_k − interes_k
  saldo_k   = saldo_{k−1} − capital_k

validación: saldo_n debe ser 0 (±1 centavo de tolerancia por redondeo) — si no,
  error de validación ANTES de guardar nada: "las cuotas definidas no cierran
  el préstamo; falta/sobra RD$X".
```

**[DECISIÓN ABIERTA]**: si `capital_k` resultara negativo (la cuota dada no cubre ni el interés del tramo), ¿se permite (amortización negativa, el saldo crece) o se rechaza? Propongo **rechazar con error explícito** — una cuota personalizada que no cubre su propio interés casi siempre es un error de captura, no una intención real.

---

## 4. Períodos de gracia

```ts
interface ParametrosGracia {
  tipo: 'capital' | 'total';
  periodos: number;
  tratamientoInteresGracia?: 'capitaliza' | 'difiere';   // solo aplica si tipo='total'
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

### 4.2 Gracia total — "capitaliza"

Durante los primeros `G` períodos no se paga nada; el interés se suma al saldo cada período (interés compuesto sobre el período de gracia):

```
saldoDespuésDeGracia = P × (1 + i)^G

por período k = G+1..n:
  se aplica el método elegido sobre (n−G) períodos, con saldo inicial = saldoDespuésDeGracia
  (es decir: el monto "P" de las fórmulas de §3 pasa a ser saldoDespuésDeGracia)
```

El deudor termina pagando intereses sobre intereses del período de gracia — es la interpretación estándar de "capitaliza".

### 4.3 Gracia total — "difiere"

Durante los primeros `G` períodos no se paga nada; el saldo de capital **no crece** (no hay interés sobre interés), pero el interés generado en esos períodos se acumula aparte:

```
interesDiferidoTotal = P × i × G     (simple, no compuesto — el capital base no cambia en la gracia)

Tratamiento del interés diferido [DECISIÓN ABIERTA — propongo default "prorrateado"]:
  "prorrateado" (default): se reparte en partes iguales sobre las (n−G) cuotas
     restantes, SUMADO a la cuota normal de cada una:
       cargoDiferidoPorCuota = interesDiferidoTotal / (n − G)
       cuotaTotal_k += cargoDiferidoPorCuota   para k = G+1..n

  "al_final": todo el interesDiferidoTotal se cobra en la última cuota, sumado
     al ajuste de cierre de §7.3.

por período k = 1..G:
  interes_k = 0 (no se cobra en el período; se registra en interesDiferidoTotal)
  capital_k = 0
  saldo_k   = P   (no crece)

por período k = G+1..n:
  se aplica el método elegido sobre (n−G) períodos, saldo inicial = P,
  más el cargo diferido del tratamiento elegido
```

La diferencia económica entre "capitaliza" y "difiere" es real y debe quedar visible en el total a pagar: "capitaliza" genera más interés total (interés sobre interés); "difiere" no.

### 4.4 Gracia de mora (ya existe, sin cambios)

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

Un monto fijo o % que se cobra una sola vez en una cuota específica (por defecto, la última) — para cargos que no son ni "al desembolso" ni "recurrentes" (ej. un cargo de cierre de expediente). **[DECISIÓN ABIERTA]**: ¿en qué cuota cae por defecto? Propongo la última, configurable a otra si se necesita.

---

## 6. Mora

```ts
interface ParametrosMora {
  base: 'capital_vencido' | 'cuota_vencida' | 'monto_fijo';
  tasaOMonto: number;              // % mensual si base≠'monto_fijo'; monto en pesos si base='monto_fijo'
  periodoMontoFijo?: 'dia' | 'cuota';  // solo si base='monto_fijo'
  topeMora?: { tipo: 'monto' | 'porcentaje_saldo'; valor: number };
  baseDiasMora: 360 | 'reales';
  diasGracia: number;               // ya existe
}
```

- **`capital_vencido`**: la mora se calcula sobre el CAPITAL vencido de la cuota (no sobre capital+interés, a diferencia de hoy) — `saldoBase = capitalPendienteDeLaCuota`.
- **`cuota_vencida`**: igual que el motor de hoy — `saldoBase = capitalPendiente + interesPendiente` de la cuota.
- **`monto_fijo`**: no depende del saldo — `mora = montoFijo × díasDeAtraso` (si `periodoMontoFijo='dia'`) o `mora = montoFijo` una sola vez por cuota vencida (si `periodoMontoFijo='cuota'`, sin importar cuántos días lleve).

Para los dos primeros, la fórmula diaria es la misma que hoy (Etapa 1, `mora.util.ts`), generalizando la base de días:

```
tasaDiaria = tasaOMonto / 100 / (baseDiasMora === 360 ? 30 : /* 'reales': */ díasDelMesEnCurso)
mora       = redondearDinero(saldoBase × tasaDiaria × díasDeAtraso)
```

**[DECISIÓN ABIERTA]**: la opción `'reales'` para `baseDiasMora` — ¿días reales del mes en curso (28-31, variable) o un promedio fijo 365/12? Propongo días reales del mes en curso, por ser la interpretación literal de "días reales" que ya usa el sistema para el **conteo** de días de atraso (aunque hoy la tasa diaria siempre se deriva de /30). Esto es nuevo (hoy solo existe la base de 30) — confirmar antes de implementar.

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
6. Francés con gracia total — capitaliza (3 períodos).
7. Francés con gracia total — difiere, prorrateado (3 períodos).
8. Francés quincenal (días fijos) — fechas verificadas a mano contra un calendario real.
9. Francés con tasa efectiva (en vez de nominal) — verificar que la tasa por período convertida coincide con el cálculo manual de §2.2.
10. Diaria con exclusión de domingos — sobre un rango que cruce al menos dos domingos, fechas verificadas a mano.
11. Un caso con cargo de apertura financiado, uno descontado, uno aparte — verificar que `P` y el monto recibido por el deudor sean los esperados en cada uno.
12. Mora con cada una de las tres bases (`capital_vencido`, `cuota_vencida`, `monto_fijo`), con y sin tope.

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

## Resumen de decisiones abiertas (para tu revisión)

| § | Decisión | Propuesta por defecto |
|---|---|---|
| 1.2 | Dos cuotas diarias que colapsan en la misma fecha tras el ajuste por feriados | Se deja así (no se fusionan) |
| 1.5 | Feriados de fecha variable (Viernes Santo, Corpus Christi, los "lunes más cercano") | Tú los confirmas/cargas; solo precargo los 5 de fecha fija |
| 2.1 | Períodos/año fijos por calendario (no recalculados desde `baseDias`) | Sí, fijos (52/24/12/6/4/2/1) |
| 2.4 | Tasa para `único`/`personalizado` | Efectiva del tramo completo, vía §2.2 |
| 3.6 | Capital negativo en una cuota personalizada | Se rechaza con error |
| 4.3 | Tratamiento por defecto del interés diferido ("gracia total — difiere") | Prorrateado en las cuotas restantes |
| 5.3 | Cuota donde cae un cargo "único diferido" por defecto | La última |
| 6 | Base de días "reales" para mora: ¿días reales del mes en curso o promedio fijo? | Días reales del mes en curso |

Nada de esto se implementa hasta que confirmes el documento completo (o ajustes lo que corresponda).
