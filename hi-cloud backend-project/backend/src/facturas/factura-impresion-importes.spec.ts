/**
 * Importes largos en la tabla de ítems de la factura.
 *
 * El bug: la columna ITBIS medía 51pt (10% del ancho útil) y ahí solo caben
 * 43pt de texto. "RD$ 1,080.00" ocupa 52.45pt a Helvetica 8.5, así que PDFKit
 * partía por el espacio de "RD$ " y el importe salía en dos líneas. Con seis
 * cifras le pasa también a Precio U., Subtotal y Total. En la vista HTML de
 * impresión pasaba lo mismo: ninguna celda numérica llevaba nowrap.
 *
 * Estas pruebas miran el render de verdad —los fragmentos de texto que PDFKit
 * escribe en el content stream— no el cálculo de anchos.
 */

import * as zlib from 'zlib';
import { generarFacturaPDF } from '../common/pdf/factura-pdf.helper';
import { generarHTMLFactura } from './templates/factura.template';
import type { FacturaPDFData, FacturaPDFItem } from './templates/factura.template';

// ── Extracción de texto dibujado ────────────────────────────────────────────

interface Fragmento { x: number; y: number; texto: string }

function fragmentos(pdf: Buffer): Fragmento[] {
  const streams: string[] = [];
  let i = 0;
  while ((i = pdf.indexOf('stream', i)) > -1) {
    let s = i + 'stream'.length;
    if (pdf[s] === 0x0d) s++;
    if (pdf[s] === 0x0a) s++;
    const e = pdf.indexOf('endstream', s);
    if (e < 0) break;
    try {
      streams.push(zlib.inflateSync(pdf.subarray(s, e)).toString('latin1'));
    } catch {
      /* stream no inflable (imagen, fuente) — no interesa */
    }
    i = e;
  }

  const out: Fragmento[] = [];
  const bloque = /BT\s+1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s+\/\S+ [\d.]+ Tf\s+\[([\s\S]*?)\]\s*TJ/g;
  for (const stream of streams) {
    let m: RegExpExecArray | null;
    while ((m = bloque.exec(stream)) !== null) {
      const texto = (m[3].match(/<([0-9a-fA-F]*)>/g) ?? [])
        .map(h => h.slice(1, -1))
        .join('')
        .replace(/../g, (par: string) => String.fromCharCode(parseInt(par, 16)));
      if (texto.trim()) out.push({ x: +m[1], y: +m[2], texto });
    }
  }
  return out;
}

/** Junta los fragmentos que comparten línea base (misma y). */
function lineas(pdf: Buffer): string[] {
  const grupos = new Map<string, Fragmento[]>();
  for (const f of fragmentos(pdf)) {
    const clave = f.y.toFixed(1);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(f);
  }
  return [...grupos.values()].map(g =>
    g.sort((a, b) => a.x - b.x).map(f => f.texto).join(''),
  );
}

// ── Datos de prueba ─────────────────────────────────────────────────────────

function item(over: Partial<FacturaPDFItem> = {}): FacturaPDFItem {
  return {
    numero: 1,
    descripcion: 'SERVICIO DE MANTENIMIENTO',
    cantidad: 1,
    precioUnitario: 1000,
    descuentoPct: 0,
    subtotal: 1000,
    itbisPct: 18,
    importeItbis: 180,
    total: 1180,
    ...over,
  };
}

function factura(over: Partial<FacturaPDFData> = {}): FacturaPDFData {
  return {
    numero: 'FAC-000123',
    fechaEmision: '2026-08-28',
    tipo: 'CONTADO',
    moneda: 'DOP',
    esOriginal: true,
    ecfNumero: 'E310000000123',
    ecfTipo: 'E31',
    empresaNombre: 'Comercial Del Este SRL',
    empresaRNC: '130123456',
    empresaDireccion: 'Av. Winston Churchill 45',
    empresaCiudad: 'Santo Domingo',
    clienteNombre: 'Distribuidora Nacional SRL',
    clienteRNC: '101234567',
    tipoCliente: 'RNC',
    items: [item()],
    subtotalGravado: 1000,
    subtotalExento: 0,
    subtotalGeneral: 1000,
    descuentoTotal: 0,
    itbisTotal: 180,
    totalGeneral: 1180,
    montoEnLetras: 'MIL CIENTO OCHENTA PESOS',
    ...over,
  };
}

/**
 * Factura de importes grandes: seis cifras con separadores de miles y
 * decimales en todas las columnas numéricas.
 */
function facturaImportesGrandes(): FacturaPDFData {
  const items = [
    item({
      numero: 1,
      descripcion: 'Equipo industrial de refrigeración modelo XR-4400',
      cantidad: 12,
      precioUnitario: 123456.78,
      descuentoPct: 15,
      subtotal: 1259259.16,
      itbisPct: 18,
      importeItbis: 226666.65,
      total: 1485925.81,
    }),
    item({
      numero: 2,
      descripcion: 'Instalación y puesta en marcha',
      cantidad: 1,
      precioUnitario: 1080,
      descuentoPct: 0,
      subtotal: 1080,
      itbisPct: 18,
      importeItbis: 194.4,
      total: 1274.4,
    }),
    item({
      numero: 3,
      descripcion: 'Póliza de servicio exenta de ITBIS',
      cantidad: 1,
      precioUnitario: 549.15,
      descuentoPct: 0,
      subtotal: 549.15,
      itbisPct: 0,
      importeItbis: 0,
      total: 549.15,
    }),
  ];
  return factura({
    items,
    subtotalGravado: 1260339.16,
    subtotalExento: 549.15,
    subtotalGeneral: 1260888.31,
    descuentoTotal: 0,
    itbisTotal: 226861.05,
    totalGeneral: 1487749.36,
  });
}

/** Los importes que deben salir enteros, en una sola línea. */
function importesEsperados(d: FacturaPDFData): string[] {
  const fmt = (n: number) =>
    'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const de: string[] = [];
  for (const it of d.items) {
    de.push(fmt(it.precioUnitario), fmt(it.subtotal), fmt(it.total));
    if (it.itbisPct !== 0) de.push(fmt(it.importeItbis));
  }
  de.push(fmt(d.subtotalGravado), fmt(d.subtotalExento), fmt(d.subtotalGeneral));
  de.push(fmt(d.itbisTotal), fmt(d.totalGeneral));
  return [...new Set(de)];
}

// ── PDF (PDFKit) ────────────────────────────────────────────────────────────

describe('PDF de factura — importes largos en columnas numéricas', () => {
  it('no parte ningún importe de seis cifras en dos líneas', async () => {
    const d   = facturaImportesGrandes();
    const pdf = await generarFacturaPDF(d);
    const ls  = lineas(pdf);

    for (const importe of importesEsperados(d)) {
      expect(ls.some(l => l.includes(importe))).toBe(true);
    }
  });

  it('nunca deja el símbolo de moneda solo en una línea', async () => {
    const pdf = await generarFacturaPDF(facturaImportesGrandes());

    // El síntoma exacto del bug: "RD$" dibujado como fragmento suelto porque
    // la cifra se fue a la línea de abajo.
    const sueltos = fragmentos(pdf).filter(f => /^(RD\$|US\$|€)\s*$/.test(f.texto));
    expect(sueltos).toEqual([]);
  });

  it('mantiene el importe del TOTAL GENERAL en una sola línea', async () => {
    const d   = facturaImportesGrandes();
    const pdf = await generarFacturaPDF(d);
    const ls  = lineas(pdf);

    const total = 'RD$ ' + d.totalGeneral.toLocaleString('es-DO', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    expect(ls.some(l => l.includes(total))).toBe(true);
  });

  it('no parte los importes de la fila de descuento general', async () => {
    const d = facturaImportesGrandes();
    d.descuentoTotal        = 125088.83;
    d.descuentoGeneralTipo  = 'monto';
    d.descuentoGeneralFinal = 147604.82;   // etiqueta larga: "(... c/ITBIS)"
    d.totalGeneral          = 1340144.54;

    const pdf = await generarFacturaPDF(d);
    const ls  = lineas(pdf);

    expect(ls.some(l => l.includes('-RD$ 125,088.83'))).toBe(true);
    expect(ls.some(l => l.includes('RD$ 1,340,144.54'))).toBe(true);
  });

  it('tampoco parte importes de tres cifras — el ITBIS ya se partía ahí', async () => {
    // No hacía falta llegar a seis cifras: la columna ITBIS daba 43pt de texto
    // y "RD$ 180.00" ya ocupa 45.36pt. Cualquier ITBIS de RD$ 100.00 en
    // adelante salía partido.
    const d   = factura();   // ITBIS de la línea = RD$ 180.00
    const pdf = await generarFacturaPDF(d);

    expect(fragmentos(pdf).filter(f => /^(RD\$|US\$|€)\s*$/.test(f.texto))).toEqual([]);
    for (const importe of importesEsperados(d)) {
      expect(lineas(pdf).some(l => l.includes(importe))).toBe(true);
    }
  });

  it('deja intacta una factura de importes de dos cifras', async () => {
    const d = factura({
      items: [item({ precioUnitario: 50, subtotal: 50, importeItbis: 9, total: 59 })],
      subtotalGravado: 50, subtotalGeneral: 50, itbisTotal: 9, totalGeneral: 59,
    });
    const pdf = await generarFacturaPDF(d);

    expect(fragmentos(pdf).filter(f => /^(RD\$|US\$|€)\s*$/.test(f.texto))).toEqual([]);
    for (const importe of importesEsperados(d)) {
      expect(lineas(pdf).some(l => l.includes(importe))).toBe(true);
    }
  });

  it('deja a la descripción el ancho que sobra, y esa sí puede envolver', async () => {
    const d = facturaImportesGrandes();
    d.items = [item({
      descripcion:
        'Equipo industrial de refrigeración modelo XR-4400 con compresor de doble etapa ' +
        'y garantía extendida de treinta y seis meses incluida en el precio',
      precioUnitario: 123456.78,
      subtotal: 123456.78,
      importeItbis: 22222.22,
      total: 145679,
    })];

    const pdf = await generarFacturaPDF(d);
    const ls  = lineas(pdf);

    // La descripción envuelve (aparece en varias líneas)…
    expect(ls.filter(l => /GARANTÍA|COMPRESOR|EQUIPO INDUSTRIAL/i.test(l)).length)
      .toBeGreaterThan(1);
    // …pero los importes de esa misma fila no.
    expect(ls.some(l => l.includes('RD$ 123,456.78'))).toBe(true);
    expect(ls.some(l => l.includes('RD$ 22,222.22'))).toBe(true);
  });
});

// ── Vista HTML de impresión ─────────────────────────────────────────────────

describe('HTML de factura — importes largos en columnas numéricas', () => {
  const NOWRAP = 'white-space:nowrap';

  it('marca nowrap en las seis celdas numéricas de cada ítem', () => {
    const html = generarHTMLFactura(facturaImportesGrandes());

    const filas = html.match(/<tr style="background:#fff[\s\S]*?<\/tr>/g) ?? [];
    expect(filas).toHaveLength(3);

    for (const fila of filas) {
      const celdas = fila.match(/<td[\s\S]*?<\/td>/g) ?? [];
      expect(celdas).toHaveLength(7);
      // La descripción es la única que puede envolver
      expect(celdas[0]).not.toContain(NOWRAP);
      for (const celda of celdas.slice(1)) expect(celda).toContain(NOWRAP);
    }
  });

  it('marca nowrap en los encabezados numéricos', () => {
    const html = generarHTMLFactura(facturaImportesGrandes());
    const ths  = html.match(/<th[\s\S]*?<\/th>/g) ?? [];

    expect(ths).toHaveLength(7);
    expect(ths[0]).toContain('Descripción');
    expect(ths[0]).not.toContain(NOWRAP);
    for (const th of ths.slice(1)) expect(th).toContain(NOWRAP);
  });

  it('mantiene enteros los importes de la fila de totales', () => {
    const d = facturaImportesGrandes();
    d.descuentoTotal        = 125088.83;
    d.descuentoGeneralTipo  = 'monto';
    d.descuentoGeneralFinal = 147604.82;
    const html = generarHTMLFactura(d);

    // Cada importe de totales va en un span propio con nowrap y sin encogerse
    for (const importe of ['RD$ 1,260,888.31', 'RD$ 226,861.05', '-RD$ 125,088.83']) {
      const span = new RegExp(
        `<span style="[^"]*${NOWRAP};flex-shrink:0;">${importe.replace(/[$.]/g, '\\$&')}</span>`,
      );
      expect(html).toMatch(span);
    }
  });

  it('mantiene entero el TOTAL GENERAL A PAGAR', () => {
    const d    = facturaImportesGrandes();
    const html = generarHTMLFactura(d);

    const bloque = html.slice(html.indexOf('TOTAL GENERAL A PAGAR'));
    const span   = bloque.slice(0, bloque.indexOf('</div>'));
    expect(span).toContain(NOWRAP);
    expect(span).toContain('RD$ 1,487,749.36');
  });

  it('no encoge los importes al añadir retenciones y neto a cobrar', () => {
    const d = facturaImportesGrandes();
    d.aplicaRetenciones   = true;
    d.montoRetencionItbis = 226861.05;
    d.montoRetencionIsr   = 126088.83;
    d.netoCobrar          = 1134799.48;

    const html   = generarHTMLFactura(d);
    const bloque = html.slice(html.indexOf('NETO A COBRAR'));
    expect(bloque.slice(0, bloque.indexOf('</div>'))).toContain(NOWRAP);
    expect(html).toContain('RD$ 1,134,799.48');
  });
});
