import { describe, it, expect } from 'vitest';
import { bloqueCuadreFormaPagoTermico } from './cuadreFormaPagoTermico';

/**
 * Bug real (2026-10-10): el cuadre por forma de pago se agregó al Drawer en
 * pantalla pero nunca a las plantillas de impresión (CajaPage.tsx, POSPage.tsx)
 * — reimprimir cualquier cierre, viejo o recién cerrado, seguía mostrando el
 * formato de solo-efectivo. Estos tests fijan que el bloque sale cuando el
 * cierre lo trae, y qué pasa en los casos borde que ya rompieron en producción.
 *
 * Segunda vuelta (mismo día, reimpresión del caso real): el neto salía
 * -295.06 en vez de -0.06, el aviso mostraba montos simétricos en vez de los
 * reales, faltaba la lista de facturas candidatas, y había un ⚠ que rompe en
 * ESC/POS.
 *
 * Tercera vuelta (mismo día, tras ver la primera tabla): ninguna línea del
 * bloque — tabla o no — puede pasar del ancho medido del papel; ni tildes ni
 * "·" en ningún dato (nombres de cliente/cajero); y un cierre recerrado
 * imprime el original anulado aparte, con la diferencia contra el conteo
 * vigente.
 *
 * Cuarta vuelta (2026-10-11, requisito de negocio): la tabla se achicaba a
 * 8pt para que una fila FORMA+3 montos cupiera en una sola línea — se veía
 * más chica que el resto del ticket. Primer rediseño: la tabla usa SIEMPRE
 * el tamaño del cuerpo vía un <div class="cf-bloque" style="font-size:Xpt">
 * propio.
 *
 * Quinta vuelta (mismo día, tras ver la tabla impresa): el <div
 * class="cf-bloque" style="font-size:Xpt"> seguía siendo un estilo PROPIO,
 * ajeno al que ya usa el resto del ticket — bastaba con que divergiera un
 * punto del tamaño real del cuerpo (ej. un cambio futuro en IMPRESORA_CONFIG)
 * para que la tabla volviera a verse distinta sin que nadie lo notara.
 * Rediseño final: el bloque se construye con el MISMO elemento, la MISMA
 * clase CSS y la MISMA función de línea que el resto del cierre — `.row`
 * (exactamente la que ya pinta "Gastos:"/"Retiros:") y `.small.bold` para
 * los títulos (exactamente la que ya atenúa "EGRESOS") — así es estructuralmente
 * imposible que este bloque divergiera en tamaño del resto, sin depender de
 * medir ni mantener un valor en pt. A 58mm/80mm, donde una fila FORMA+3
 * montos no cabe en los 2 spans de `.row`, el nombre de la forma va en su
 * propio `<div>` y los 3 montos en un `.row` aparte, alineados con NBSP.
 */

function parse(html: string): HTMLDivElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

interface FilaRow { clase: string; izq: string; der: string }

function filas(html: string): FilaRow[] {
  return Array.from(parse(html).querySelectorAll('div.row')).map(el => ({
    clase: el.className,
    izq: el.children[0]?.textContent ?? '',
    der: el.children[1]?.textContent ?? '',
  }));
}

function textos(html: string, selector: string): string[] {
  return Array.from(parse(html).querySelectorAll(selector)).map(el => el.textContent ?? '');
}

/** Todos los <div> de nivel superior, unidos con espacio — para buscar un título que envolver() puede partir en varias líneas. */
function textoPlano(html: string): string {
  return Array.from(parse(html).children).map(d => d.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
}

const CLASES_PERMITIDAS = new Set(['row', 'small', 'bold', 'sep', 'center', 'fe-anulada']);

/** Nunca un [style] propio, y nunca una clase fuera de las que ya usa el resto del ticket. */
function sinEstiloPropio(html: string): boolean {
  const root = parse(html);
  if (root.querySelector('[style]')) return false;
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const c of Array.from(el.classList)) {
      if (!CLASES_PERMITIDAS.has(c)) return false;
    }
  }
  return true;
}

describe('bloqueCuadreFormaPagoTermico', () => {
  const cierreReal = {
    cuadrePorFormaPago: [
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ],
    sospechasFormaPago: [
      {
        formaSobrante: 'efectivo', formaFaltante: 'tarjeta',
        montoSobrante: 829.94, montoFaltante: -830.00,
        facturasCandidatas: [{ id: 1803, folio: 'FAC-1803', total: 1080, formasPago: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }] }],
      },
    ],
    facturasSinFormaPago: [
      { id: 1807, folio: 'FAC-1807', total: 295.00, clienteNombre: 'Bellamar González' },
    ],
  };

  it('caso real (empresa 73): imprime la tabla, la sospecha con los montos REALES, la candidata y la factura sin forma de pago', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(textoPlano(html)).toContain('CUADRE POR FORMA DE PAGO');
    expect(html).toContain('5,608.06');
    expect(html).toContain('6,438.00');
    expect(html).toContain('2,605.00');
    expect(html).toContain('1,775.00');
    expect(html).toContain('+829.94');
    expect(html).toContain('-830.00');
    expect(textoPlano(html)).toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).toContain('FAC-1803'); // candidata que explica la sospecha
    expect(textoPlano(html)).toContain('Tarjeta 955.00');
    expect(textoPlano(html)).toContain('Efectivo 125.00');
    expect(textoPlano(html)).toContain('FACTURAS SIN FORMA DE PAGO');
    expect(html).toContain('FAC-1807');
    expect(html).toContain('Bellamar Gonzalez'); // sin tilde — ver describe('sin tildes...')
    // neto del caso real: 829.94 - 830.00 = -0.06
    expect(html).toContain('-0.06');
  });

  it('nunca imprime caracteres especiales (⚠) — texto plano para ESC/POS', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(textoPlano(html)).toContain('!! POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('⚠');
  });

  it('el aviso muestra los montos REALES de cada forma, no asume que sobrante y faltante son simétricos', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [
        { forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 },
      ],
      sospechasFormaPago: [{
        formaSobrante: 'efectivo', formaFaltante: 'tarjeta',
        montoSobrante: 829.94, montoFaltante: -830.00, // nunca -829.94
      }],
    });
    expect(html).toContain('+829.94');
    expect(html).toContain('-830.00');
    expect(html).not.toContain('-829.94');
  });

  it('sin cuadrePorFormaPago (ej. caja ABIERTA): no imprime nada — el llamador cae a su bloque viejo', () => {
    expect(bloqueCuadreFormaPagoTermico(undefined)).toBe('');
    expect(bloqueCuadreFormaPagoTermico({})).toBe('');
    expect(bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: [] })).toBe('');
  });

  it('cierre derivado (legacy, cuadreEstimado): lo marca "(estimado)" en el título', () => {
    const html = bloqueCuadreFormaPagoTermico({ ...cierreReal, cuadreEstimado: true });
    expect(textoPlano(html)).toContain('CUADRE POR FORMA DE PAGO (estimado)');
  });

  it('sin sospechas ni facturas sin forma de pago: solo la tabla, sin avisos', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
    });
    expect(textoPlano(html)).toContain('CUADRE POR FORMA DE PAGO');
    expect(html).not.toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('FACTURAS SIN FORMA DE PAGO');
  });

  it('sospecha sin facturas candidatas: no revienta, no imprime la sección de candidatas', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 150, diferencia: 50 }],
      sospechasFormaPago: [{ formaSobrante: 'efectivo', formaFaltante: 'tarjeta', montoSobrante: 50, montoFaltante: -50 }],
    });
    expect(textoPlano(html)).toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('podrian explicarlo');
  });

  it('con un ajuste posterior (cuadreCorregido): muestra el original Y el corregido', () => {
    const html = bloqueCuadreFormaPagoTermico({
      ...cierreReal,
      cuadreCorregido: [
        { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
        { forma: 'tarjeta',  esperado: 1775.00, declarado: 1775.00, diferencia: 0 },
      ],
    });
    expect(textoPlano(html)).toContain('CUADRE CORREGIDO');
    expect(html).toContain('6,438.06');
    // el original sigue presente también
    expect(html).toContain('5,608.06');
  });

  it('nunca declara font-size/letter-spacing/line-height propio — usa las mismas clases que "Gastos:"/"EGRESOS"', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(sinEstiloPropio(html)).toBe(true);
  });

  it('el título es un .small.bold, como "EGRESOS"', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
    });
    const titulos = textos(html, 'div.small.bold');
    expect(titulos.some(t => t.includes('CUADRE POR FORMA DE PAGO'))).toBe(true);
  });

  // Requisito explícito (2026-10-11, quinta vuelta): a 58mm/80mm la tabla usa
  // el MISMO `.row` que el resto del ticket — no cabe una fila FORMA+3 montos
  // completa en sus 2 spans, así que el nombre de la forma va en su propio
  // `<div>` y ESPERADO/CONTADO/DIFER. (con su encabezado una sola vez) en un
  // `.row` aparte, alineados a la derecha bajo su columna.
  describe('tabla ESPERADO/CONTADO/DIFER. — forma en su línea, montos en un .row aparte (58mm/80mm)', () => {
    const filasCierre = [
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ];

    it('80mm (por defecto): cada forma en su div, montos en un .row, con comas de miles', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasCierre }, '80mm');
      const divs = Array.from(parse(html).children);
      const iEf = divs.findIndex(d => d.textContent === 'Efectivo');
      const iTa = divs.findIndex(d => d.textContent === 'Tarjeta');
      const iTo = divs.findIndex(d => d.textContent === 'TOTAL');
      expect(iEf).toBeGreaterThan(-1);
      const mEf = divs[iEf + 1].textContent ?? '';
      const mTa = divs[iTa + 1].textContent ?? '';
      const mTo = divs[iTo + 1].textContent ?? '';
      expect(mEf).toContain('5,608.06');
      expect(mEf).toContain('+829.94');
      expect(mTa).toContain('2,605.00');
      expect(mTa).toContain('-830.00');
      expect(mTo).toContain('8,213.06');
      expect(mTo).toContain('8,213.00');
      expect(mTo).toContain('-0.06');
      expect(html).toContain('(+) sobra');
      expect(html).toContain('(-) falta');
      expect(html).toContain('RESULTADO: FALTAN');
      expect(html).toContain('RD$0.06');
    });

    it('58mm: igual, sin comas de miles', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasCierre }, '58mm');
      const divs = Array.from(parse(html).children);
      const iEf = divs.findIndex(d => d.textContent === 'Efectivo');
      const iTa = divs.findIndex(d => d.textContent === 'Tarjeta');
      const iTo = divs.findIndex(d => d.textContent === 'TOTAL');
      const mEf = divs[iEf + 1].textContent ?? '';
      const mTa = divs[iTa + 1].textContent ?? '';
      const mTo = divs[iTo + 1].textContent ?? '';
      expect(mEf).not.toContain('5,608.06');
      expect(mEf).toContain('5608.06');
      expect(mEf).toContain('6438.00');
      expect(mEf).toContain('+829.94');
      expect(mTa).toContain('2605.00');
      expect(mTa).toContain('1775.00');
      expect(mTa).toContain('-830.00');
      expect(mTo).toContain('8213.06');
      expect(mTo).toContain('8213.00');
      expect(mTo).toContain('-0.06');
    });

    it('bluetooth usa el mismo trato que 58mm (la BT-58UB es una impresora de 58mm)', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasCierre }, 'bluetooth');
      expect(html).not.toContain('5,608.06');
      expect(html).toContain('5608.06');
    });

    it('un monto que no entra en su columna ni siquiera sin comas pasa a su propia línea con etiqueta', () => {
      // A 58mm, wEsp=8 y wDif=7: "100000.00" (9) y "-93562.00" (9) exceden
      // sus columnas; "6438.00" (7) sí entra en wCon=8.
      const filasGrandes = [
        { forma: 'efectivo', esperado: 100000.00, declarado: 6438.00, diferencia: -93562.00 },
      ];
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasGrandes }, '58mm');
      expect(html).toContain('Esperado:');
      expect(html).toContain('100000.00');
      expect(html).toContain('Difer.:');
      expect(html).toContain('-93562.00');
    });

    it('cuadrado: el resultado dice CUADRA, no "SOBRAN RD$0.00" ni "FALTAN RD$0.00"', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
      });
      expect(html).toContain('RESULTADO: CUADRA');
      expect(html).not.toContain('SOBRAN');
      expect(html).not.toContain('FALTAN');
    });

    it('una forma sin movimiento ni declaración (0/0/0) no aparece como fila de la tabla', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [
          { forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 },
          { forma: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
        ],
      });
      expect(textoPlano(html)).not.toContain('Transfer');
    });
  });

  // Caso real reportado 2026-10-11: turno con solo efectivo y tarjeta,
  // esperado 27,948.00/contado 27,995.00 en efectivo (sobran RD$47.00),
  // tarjeta 1,120.00/1,120.00 exacto — todos los valores caben sin respaldo.
  describe('caso real 2026-10-11 — turno Ferretería Pavel (sin TOTAL que desborde)', () => {
    const filasCierre = [
      { forma: 'efectivo', esperado: 27948.00, declarado: 27995.00, diferencia: 47.00 },
      { forma: 'tarjeta',  esperado: 1120.00,  declarado: 1120.00,  diferencia: 0 },
    ];

    it('80mm: cada valor cabe sin desbordar ninguna columna (ningún "Esperado:"/"Contado:"/"Difer.:" de respaldo)', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasCierre }, '80mm');
      expect(html).toContain('27,948.00');
      expect(html).toContain('27,995.00');
      expect(html).toContain('+47.00');
      expect(html).toContain('1,120.00');
      expect(html).toContain('29,068.00');
      expect(html).toContain('29,115.00');
      expect(html).not.toContain('Esperado:');
      expect(html).toContain('RESULTADO: SOBRAN RD$47.00');
    });

    it('58mm: cada valor cabe sin desbordar ninguna columna (ningún "Esperado:"/"Contado:"/"Difer.:" de respaldo)', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasCierre }, '58mm');
      expect(html).toContain('27948.00');
      expect(html).toContain('27995.00');
      expect(html).toContain('+47.00');
      expect(html).toContain('1120.00');
      expect(html).toContain('29068.00');
      expect(html).toContain('29115.00');
      expect(html).not.toContain('Esperado:');
      expect(textoPlano(html)).toContain('RESULTADO: SOBRAN RD$47.00');
    });
  });

  // Caso real del reclamo 2026-10-11 (foto en papel carta): a 80mm, wDif=9
  // alcanza para que el TOTAL con comas (+1,036.74, 9 car.) quepa COMPLETO,
  // así que la tabla entera (filas, TOTAL y RESULTADO) conserva comas.
  describe('80mm: el TOTAL con comas cabe completo (wDif=9) — ninguna fila cae a sin comas', () => {
    const filasCierre = [
      { forma: 'efectivo', esperado: 17443.25, declarado: 17700.00, diferencia: 256.75 },
      { forma: 'tarjeta',  esperado: 1845.01,  declarado: 2625.00,  diferencia: 779.99 },
    ];

    it('80mm: ESPERADO/CONTADO/DIFER. y el RESULTADO conservan la coma de millar', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasCierre }, '80mm');
      expect(html).toContain('17,443.25');
      expect(html).toContain('17,700.00');
      expect(html).toContain('19,288.26');
      expect(html).toContain('20,325.00');
      expect(html).toContain('+1,036.74');
      expect(textoPlano(html)).toContain('RESULTADO: SOBRAN RD$1,036.74');
    });

    it('80mm: un TOTAL que SÍ excede incluso wDif=9 sin comas (6+ cifras) cae al respaldo — el Difer. pasa a línea aparte, lo demás conserva su coma', () => {
      const filasExtremas = [
        { forma: 'efectivo', esperado: 500000.00, declarado: 600000.00, diferencia: 100000.00 },
        { forma: 'tarjeta',  esperado: 1000.00,   declarado: 1000.94,   diferencia: 0.94 },
      ];
      // Ni "500,000.00" (10 car.) ni sin coma (9) caben en wEsp=9 a la vez
      // que "+100,000.00"/"+100,000.94" (11/12 car.) en wDif=9 — la tabla
      // entera cae al formato de respaldo. Ahí cada valor que SÍ cabe
      // (con coma) se queda en su línea; solo Esperado/Contado/Difer. del
      // TOTAL, que no caben ni con 6 cifras, pasan a su propia línea.
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasExtremas }, '80mm');
      expect(html).toContain('Difer.:');
      expect(html).toContain('+100,000.94');
    });

    it('58mm: ya sin comas por defecto — el TOTAL (+1036.74, 8 car.) excede wDif=7 y cae al respaldo solo en ese valor', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasCierre }, '58mm');
      expect(html).toContain('17443.25');
      expect(html).toContain('17700.00');
      expect(html).toContain('19288.26');
      expect(html).toContain('20325.00');
      expect(html).toContain('Difer.:');
      expect(html).toContain('+1036.74');
      // "RESULTADO: SOBRAN RD$1036.74" (29 car.) excede el ancho de 24 a
      // 58mm, así que envolver() lo parte en 2 líneas — igual que cualquier
      // otro título largo del bloque.
      expect(textoPlano(html)).toContain('RESULTADO: SOBRAN RD$1036.74');
    });
  });

  // Requisito explícito (2026-10-10): sin tildes ni caracteres especiales en
  // NINGÚN dato (no solo en el texto fijo), y sin "·" en ningún canal — no
  // solo camino Bluetooth, también el HTML que renderiza el navegador.
  describe('sin tildes ni caracteres especiales en los datos', () => {
    it('nombre de cliente con tildes sale sin tildes, en facturas sin forma de pago y en candidatas', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
        sospechasFormaPago: [{
          formaSobrante: 'efectivo', formaFaltante: 'tarjeta', montoSobrante: 50, montoFaltante: -50,
          facturasCandidatas: [{ id: 1, folio: 'FAC-ÑOÑO', total: 50, formasPago: [{ tipo: 1, monto: 50 }] }],
        }],
        facturasSinFormaPago: [{ id: 2, folio: 'FAC-2', total: 30, clienteNombre: 'José Ñúñez Peña' }],
      });
      expect(html).not.toMatch(/[áéíóúÁÉÍÓÚñÑ]/);
      expect(html).toContain('Jose Nunez Pena');
      expect(html).toContain('FAC-NONO');
    });

    it('un "·" en cualquier dato se reemplaza, nunca llega intacto al HTML', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
        facturasSinFormaPago: [{ id: 1, folio: 'FAC-1', total: 10, clienteNombre: 'Cliente · Con Punto' }],
      });
      expect(html).not.toContain('·');
    });
  });

  // Requisito explícito (2026-10-10): un cierre anulado y re-cerrado imprime
  // el vigente arriba y, aparte, "CIERRE ORIGINAL ANULADO" con el conteo y
  // la declaración del original y la diferencia contra el conteo vigente.
  // Caso real: Beatriz Riva recerró la caja de Bellamar González y la
  // tarjeta esperada del primer cierre se perdió sin dejar rastro.
  describe('CIERRE ORIGINAL ANULADO (recierre)', () => {
    const recierre = {
      cuadrePorFormaPago: [
        { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
      ],
      saldoFisico: 6438.00,
      contadoOriginal: 6200.00,
      cuadrePorFormaPagoOriginal: [
        { forma: 'efectivo', esperado: 5000.00, declarado: 6200.00, diferencia: 1200.00 },
      ],
      facturasSinFormaPagoOriginal: [
        { id: 1700, folio: 'FAC-1700', total: 50.00, clienteNombre: 'José Pérez' },
      ],
    };

    it('sin contadoOriginal (cierre nunca recerrado): no imprime el bloque', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
      });
      expect(textoPlano(html)).not.toContain('CIERRE ORIGINAL ANULADO');
    });

    it('con contadoOriginal: imprime el bloque con el conteo original, el recierre y la diferencia entre ambos', () => {
      const html = bloqueCuadreFormaPagoTermico(recierre);
      expect(textoPlano(html)).toContain('CIERRE ORIGINAL ANULADO');
      expect(html).toContain('6,200.00'); // contado original
      expect(html).toContain('6,438.00'); // contado del recierre (vigente)
      expect(html).toContain('+238.00');  // diferencia: 6438.00 - 6200.00
      // la declaración original también se imprime, con su propia tabla —
      // su TOTAL con comas ("+1,200.00", 9 car.) cabe exacto en wDif=9 a
      // 80mm, así que también conserva comas.
      expect(html).toContain('5,000.00');
      expect(html).toContain('1,200.00');
      expect(html).toContain('FAC-1700');
      expect(html).toContain('Jose Perez'); // sin tilde
    });

    it('58mm: el bloque de recierre también sale sin comas', () => {
      const html = bloqueCuadreFormaPagoTermico(recierre, '58mm');
      expect(textoPlano(html)).toContain('CIERRE ORIGINAL ANULADO');
      expect(html).toContain('6200.00');
      expect(html).toContain('6438.00');
      expect(html).not.toContain('6,200.00');
    });
  });

  // Requisito explícito (2026-10-10): "ninguna línea fuera de la tabla puede
  // pasar del ancho medido" — se extiende a TODO el bloque (tabla, aviso,
  // candidatas, facturas sin forma, recierre), para cualquier dato. Con el
  // rediseño a `.row` esto ya no es "una línea de texto", sino: ningún texto
  // libre (título, folio, nombre) envuelto por envolver() debe superar el
  // ancho del papel medido en caracteres.
  describe('ningún texto libre supera el ancho medido del papel, para cualquier dato', () => {
    const ANCHOS: Record<string, number> = { '58mm': 24, '80mm': 30, bluetooth: 24, carta: 41, ninguna: 30 };

    const escenarios: any[] = [
      {
        cuadrePorFormaPago: [
          { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
          { forma: 'tarjeta', esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
          { forma: 'transferencia', esperado: 1234567.89, declarado: 1, diferencia: -1234566.89 },
          { forma: 'otros', esperado: 12.5, declarado: 12.5, diferencia: 0 },
        ],
        sospechasFormaPago: [
          {
            formaSobrante: 'efectivo', formaFaltante: 'tarjeta', montoSobrante: 829.94, montoFaltante: -830.00,
            facturasCandidatas: [
              { id: 1, folio: 'FAC-00001803-MUY-LARGO', total: 1080, formasPago: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }] },
              { id: 2, folio: 'FAC-2', total: 99999.99, formasPago: [{ tipo: 2, monto: 50000 }, { tipo: 4, monto: 49999.99 }] },
            ],
          },
          { formaSobrante: 'otros', formaFaltante: 'transferencia', montoSobrante: 1, montoFaltante: -1 },
        ],
        facturasSinFormaPago: [
          { id: 1, folio: 'FAC-1807', total: 295.00, clienteNombre: 'María José Rodríguez De La Cruz Peña Núñez' },
          { id: 2, folio: 'FAC-LARGO-1807', total: -99999.99 },
        ],
        cuadreCorregido: [
          { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
        ],
        saldoFisico: 6438.00,
        contadoOriginal: 6200.00,
        cuadrePorFormaPagoOriginal: [
          { forma: 'efectivo', esperado: 5000.00, declarado: 6200.00, diferencia: 1200.00 },
          { forma: 'tarjeta', esperado: -50000, declarado: 50000.5, diferencia: 100000.5 },
        ],
        facturasSinFormaPagoOriginal: [
          { id: 3, folio: 'FAC-1700', total: 50.00, clienteNombre: 'José Ñúñez Peña De Óyanguren' },
        ],
      },
      {
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 0.01, declarado: 0.02, diferencia: 0.01 }],
      },
      {
        cuadrePorFormaPago: [{ forma: 'tarjeta', esperado: -0.5, declarado: -0.5, diferencia: 0 }],
        facturasSinFormaPago: [{ id: 9, folio: 'X', total: 0 }],
      },
    ];

    // Un folio/nombre largo pasa por envolver(), que SÍ respeta el ancho; un
    // monto (columnas3/columnas3ConHueco) nunca supera su propia columna por
    // construcción (columnas3 devuelve null y cae al respaldo si no cabe).
    // Lo que valida esta prueba es la parte de texto libre, no numérica.
    for (const tipoImpresora of Object.keys(ANCHOS)) {
      it(`tipoImpresora="${tipoImpresora}" (ancho ${ANCHOS[tipoImpresora]}): ningún <div> de texto libre supera el ancho`, () => {
        const ancho = ANCHOS[tipoImpresora];
        for (const r of escenarios) {
          const html = bloqueCuadreFormaPagoTermico(r, tipoImpresora);
          for (const d of Array.from(parse(html).children)) {
            if (d.classList.contains('row')) continue; // las columnas numéricas tienen su propia garantía
            if (d.classList.contains('sep')) continue; // separador fijo de la plantilla, igual en todo el ticket
            const texto = d.textContent ?? '';
            expect(texto.length, `"${texto}" (${texto.length} > ${ancho}) en ${tipoImpresora}`).toBeLessThanOrEqual(ancho);
          }
        }
      });
    }
  });
});
