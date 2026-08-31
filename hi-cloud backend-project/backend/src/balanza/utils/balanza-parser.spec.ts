/**
 * balanza-parser — rango de prefijos EAN y riesgo de colisión.
 *
 * CONTEXTO
 * ─────────
 * El prefijo de un patrón de balanza estaba limitado a '2' y '20'-'29': el bloque
 * que GS1 reserva para circulación restringida / uso interno de tienda. Se amplió
 * a '20'-'99' porque hay balanzas configuradas de fábrica fuera de ese bloque.
 *
 * El límite vivía en CUATRO capas que tenían que moverse juntas — formulario,
 * DTO, parser y (no) la BD. Estos tests fijan las tres que son código:
 *
 *   · PREFIJOS_BALANZA           (parser + asistente de calibración)
 *   · @IsIn del CreatePatronDto  (alta por API)
 *   · UpdatePatronDto            (edición por API — ver más abajo)
 *
 * POR QUÉ IMPORTA LA MEDICIÓN DE COLISIÓN
 * ────────────────────────────────────────
 * Del 30 al 99 son prefijos de país/empresa YA asignados por GS1 (84 = España,
 * 74x = Centroamérica y Caribe…). Un patrón ahí puede tragarse EAN-13 legítimos
 * de fabricante. El formulario avisa de ello y recomienda activar el dígito
 * verificador interno, diciendo que "descarta unos 9 de cada 10".
 *
 * Esa cifra no es retórica: sale de la medición de abajo. Si alguien cambia la
 * geometría del parser o el algoritmo del check interno y la cifra se mueve,
 * estos tests fallan y el texto de la interfaz deja de ser cierto.
 */

// Lo carga main.ts en producción; en un test que importa DTOs hay que pedirlo
// explícitamente o los decoradores de class-validator no llegan a registrarse.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  PREFIJOS_BALANZA,
  prefijoFueraDeBloqueReservado,
  calcularCheckEAN,
  validarEAN,
  parsearCodigoBalanza,
  inferirPatrones,
  BalanzaPatronConfig,
} from './balanza-parser';
import { CreatePatronDto } from '../dto/create-patron.dto';
import { UpdatePatronDto } from '../dto/update-patron.dto';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Construye un EAN-13 de balanza válido: prefijo + PLU + valor + check interno + check EAN. */
function etiquetaBalanza(prefijo: string, plu: string, valor: string): string {
  const checkInterno = String(valor.split('').reduce((s, d) => s + Number(d), 0) % 10);
  const cuerpo = prefijo + plu + valor + checkInterno;
  return cuerpo + calcularCheckEAN(cuerpo);
}

/** Patrón base de 13 dígitos con check interno: pref(2) + PLU(4) + valor(5) + chk(1) + ean(1). */
function patron(over: Partial<BalanzaPatronConfig> = {}): BalanzaPatronConfig {
  return {
    id: 1,
    prefijo: '21',
    longitudPlu: 4,
    tipoDato: 'peso',
    longitudValor: 5,
    decimalesValor: 3,
    unidadPeso: 'KG',
    tieneCheckValor: true,
    longitudTotal: 13,
    prioridad: 100,
    ...over,
  };
}

const erroresDe = (dto: object) =>
  validateSync(dto, { whitelist: true }).flatMap((e) => Object.keys(e.constraints ?? {}));

// ── 1. La lista de prefijos ───────────────────────────────────────────────────

describe('PREFIJOS_BALANZA — rango admitido', () => {
  it("incluye el '2' de un dígito (patrón clásico Mettler Toledo)", () => {
    expect(PREFIJOS_BALANZA).toContain('2');
  });

  it("cubre '20' a '99' completo", () => {
    for (let n = 20; n <= 99; n++) {
      expect(PREFIJOS_BALANZA).toContain(String(n));
    }
  });

  it("NO admite '00'-'19': colisiona con UPC-A / EE.UU.", () => {
    const bajos = PREFIJOS_BALANZA.filter((p) => p.length === 2 && Number(p) < 20);
    expect(bajos).toEqual([]);
  });

  it('tiene exactamente 81 entradas y ninguna repetida', () => {
    expect(PREFIJOS_BALANZA).toHaveLength(81);
    expect(new Set(PREFIJOS_BALANZA).size).toBe(81);
  });
});

describe('prefijoFueraDeBloqueReservado — qué se marca como riesgo', () => {
  it.each(['2', '20', '25', '29'])('%s está en el bloque reservado → sin riesgo', (p) => {
    expect(prefijoFueraDeBloqueReservado(p)).toBe(false);
  });

  it.each(['30', '74', '84', '99'])('%s es prefijo de país asignado → riesgo', (p) => {
    expect(prefijoFueraDeBloqueReservado(p)).toBe(true);
  });
});

// ── 2. Las otras capas del límite ─────────────────────────────────────────────

describe('CreatePatronDto — el alta por API acepta el mismo rango', () => {
  const base = {
    nombre: 'Balanza mostrador',
    longitudPlu: 4,
    tipoDato: 'peso',
    longitudValor: 5,
    decimalesValor: 3,
    unidadPeso: 'KG',
    tieneCheckValor: true,
    longitudTotal: 13,
  };
  const conPrefijo = (prefijo: string) => plainToInstance(CreatePatronDto, { ...base, prefijo });

  it.each(['2', '21', '30', '84', '99'])('acepta el prefijo %s', (p) => {
    expect(erroresDe(conPrefijo(p))).toEqual([]);
  });

  it.each(['19', '00', '100', 'AB', ''])('rechaza el prefijo "%s"', (p) => {
    expect(erroresDe(conPrefijo(p))).toContain('isIn');
  });
});

/**
 * REGRESIÓN: el controlador declaraba `@Body() dto: Partial<CreatePatronDto>`.
 * `Partial<T>` es puramente de TypeScript y se borra en runtime — el metatipo que
 * ve Nest pasa a ser `Object`, así que el ValidationPipe global omitía el PATCH
 * por completo y NINGUNA regla se aplicaba al editar un patrón.
 *
 * UpdatePatronDto (PartialType) genera una clase real que conserva los
 * decoradores haciéndolos opcionales. Si alguien vuelve a poner `Partial<>`,
 * el test de "rechaza" cae.
 */
describe('UpdatePatronDto — la edición por API valida de verdad', () => {
  it('acepta un cuerpo vacío: todos los campos son opcionales', () => {
    expect(erroresDe(plainToInstance(UpdatePatronDto, {}))).toEqual([]);
  });

  it('acepta una edición parcial legítima', () => {
    expect(erroresDe(plainToInstance(UpdatePatronDto, { prefijo: '84' }))).toEqual([]);
  });

  it('rechaza un prefijo fuera de rango en una edición parcial', () => {
    expect(erroresDe(plainToInstance(UpdatePatronDto, { prefijo: '19' }))).toContain('isIn');
  });
});

// ── 3. Lectura: el parser nunca estuvo fijado al bloque reservado ─────────────

describe('parsearCodigoBalanza — decodifica con cualquier prefijo configurado', () => {
  it.each(['21', '30', '84', '99'])('lee una etiqueta con prefijo %s', (pref) => {
    const codigo = etiquetaBalanza(pref, '0123', '04500');
    const r = parsearCodigoBalanza(codigo, [patron({ prefijo: pref })]);

    expect(r).not.toBeNull();
    expect(r!.plu).toBe(123);
    expect(r!.valor).toBeCloseTo(4.5, 9);
    expect(r!.unidadPeso).toBe('KG');
  });

  it('ignora un código cuyo prefijo no coincide con ningún patrón', () => {
    const codigo = etiquetaBalanza('84', '0123', '04500');
    expect(parsearCodigoBalanza(codigo, [patron({ prefijo: '21' })])).toBeNull();
  });

  it('rechaza cualquier código con check EAN inválido antes de mirar patrones', () => {
    const codigo = etiquetaBalanza('84', '0123', '04500');
    const corrupto = codigo.slice(0, 12) + String((Number(codigo[12]) + 1) % 10);

    expect(validarEAN(corrupto)).toBe(false);
    expect(parsearCodigoBalanza(corrupto, [patron({ prefijo: '84' })])).toBeNull();
  });
});

/**
 * Ésta es la capa que de verdad bloqueaba al usuario: el asistente de calibración
 * y el probador generan candidatos con inferirPatrones(), que SÍ iteraba la lista
 * fija. Con la lista antigua, escanear una etiqueta con prefijo 84 devolvía [] y
 * el patrón no se podía calibrar aunque el parser supiera leerlo.
 */
describe('inferirPatrones — el asistente cubre todo el rango', () => {
  it.each(['21', '30', '84', '99'])(
    'propone candidatos para una etiqueta con prefijo %s',
    (pref) => {
      const codigo = etiquetaBalanza(pref, '0123', '04500');
      const candidatos = inferirPatrones(codigo);

      expect(candidatos.some((c) => c.prefijo === pref)).toBe(true);
      expect(candidatos.every((c) => codigo.startsWith(c.prefijo))).toBe(true);
    },
  );

  /**
   * El '2' de un dígito convive con los de dos: una etiqueta 21… encaja en ambos.
   * Es intencionado — el asistente ofrece las dos lecturas y, ya guardados, el
   * campo `prioridad` decide cuál gana (parsearCodigoBalanza ordena por él).
   */
  it("una etiqueta 21… ofrece tanto el prefijo '2' como el '21'", () => {
    const prefijos = new Set(
      inferirPatrones(etiquetaBalanza('21', '0123', '04500')).map((c) => c.prefijo),
    );
    expect([...prefijos].sort()).toEqual(['2', '21']);
  });

  it('no propone nada para un código que no supera la validación EAN', () => {
    expect(inferirPatrones('8400000000000')).toEqual([]);
  });
});

// ── 4. La medición que sostiene los avisos de la interfaz ────────────────────

/**
 * Cuánto se traga un patrón fuera del bloque reservado.
 *
 * Se generan EAN-13 de fabricante español válidos (848…) y se cuenta cuántos
 * captura por error un patrón con prefijo '84', con y sin check interno.
 *
 * Las cifras son deterministas: entradas fijas y funciones puras. Se asertan
 * EXACTAS a propósito — si la geometría del parser o el algoritmo del check
 * interno cambian, esto falla y hay que revisar el texto que la interfaz
 * enseña al usuario ("descarta unos 9 de cada 10").
 */
describe('riesgo de colisión de un prefijo fuera del bloque reservado', () => {
  const TOTAL = 1000;

  /**
   * EAN-13 de fabricante español válidos: 848 + 9 dígitos + check EAN.
   *
   * Los 9 dígitos se sortean con un generador congruencial de semilla fija: el
   * corpus es idéntico en cada ejecución, pero variado. NO usar una secuencia
   * como String(n).padStart(9,'0') — deja seis ceros fijos y el campo de valor
   * queda con dos dígitos útiles, así que la medición se vuelve insensible: con
   * ese corpus, cambiar el check interno de mod 10 a mod 9 daba exactamente la
   * misma cifra y el test no se enteraba.
   */
  let semilla = 20260831;
  const siguiente = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;

  const eanFabricante = Array.from({ length: TOTAL }, () => {
    let cuerpo = '848';
    for (let i = 0; i < 9; i++) cuerpo += Math.floor(siguiente() * 10);
    return cuerpo + calcularCheckEAN(cuerpo);
  });

  //  sin check: pref(2) + PLU(4) + valor(6) + 0 + ean(1) = 13
  const SIN_CHECK = patron({ prefijo: '84', longitudValor: 6, tieneCheckValor: false });
  //  con check: pref(2) + PLU(4) + valor(5) + 1 + ean(1) = 13
  const CON_CHECK = patron({ prefijo: '84', longitudValor: 5, tieneCheckValor: true });

  const capturados = (p: BalanzaPatronConfig) =>
    eanFabricante.filter((c) => parsearCodigoBalanza(c, [p]) !== null).length;

  it('el corpus de prueba son 1000 EAN-13 de fabricante válidos', () => {
    expect(eanFabricante).toHaveLength(TOTAL);
    expect(eanFabricante.every(validarEAN)).toBe(true);
  });

  it('SIN check interno el patrón se traga TODO: 1000 de 1000', () => {
    expect(capturados(SIN_CHECK)).toBe(1000);
  });

  it('CON check interno la captura baja a 111 de 1000 (~9 de cada 10 descartados)', () => {
    expect(capturados(CON_CHECK)).toBe(111);
  });

  it('el check interno es la defensa: filtra al menos 8 veces mejor', () => {
    expect(capturados(SIN_CHECK) / capturados(CON_CHECK)).toBeGreaterThanOrEqual(8);
  });

  it('aun con check interno queda ~10 % sin filtrar: el aviso no promete inmunidad', () => {
    const restante = capturados(CON_CHECK) / TOTAL;
    expect(restante).toBeGreaterThan(0.05);
    expect(restante).toBeLessThan(0.15);
  });

  it('en el bloque reservado 20-29 el problema no existe: ningún 848… empieza por 21', () => {
    const p = patron({ prefijo: '21', longitudValor: 6, tieneCheckValor: false });
    expect(capturados(p)).toBe(0);
  });
});
