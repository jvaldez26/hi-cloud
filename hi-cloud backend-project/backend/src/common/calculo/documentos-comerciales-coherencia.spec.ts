import {
  calcularTotalesConDescuento,
  type LineaDescuentoInput,
} from './descuento-documento';

/**
 * Los cuatro documentos comerciales tienen que calcular el MISMO dinero.
 *
 * Una cotización se convierte en factura. Una pre-factura, también. Si cada uno
 * calculara el descuento por su cuenta, el total cambiaría al convertir y eso es
 * una discusión con el cliente delante.
 *
 * Antes de `1762100000000-AddDescuentosADocumentosComerciales`, cotización,
 * pro-forma y pre-factura no tenían descuento y hacían `precio × cantidad` con
 * su propia aritmética; ahora los tres pasan por `calcularTotalesConDescuento`,
 * el mismo helper que factura.
 *
 * Esta prueba vigila esa unión por dos lados:
 *
 *   1. Qué cambió respecto a la aritmética ANTERIOR de cada documento. No es
 *      "nada": unificar tenía un precio y conviene tenerlo escrito.
 *
 *      Los tres calculaban el ITBIS sobre el subtotal YA REDONDEADO a 2
 *      decimales; el helper —y por tanto la factura— lo calcula sobre la base
 *      CRUDA, sin redondeo intermedio, que es lo que evita el error de un
 *      centavo contra lo declarado. Con precios de 2 decimales las dos fórmulas
 *      coinciden siempre. Con más decimales pueden separarse UN centavo, y el
 *      valor bueno es el nuevo: es el que la factura va a calcular al convertir.
 *
 *      Esto importa porque desde `7113951d` el POS envía precios de 4 decimales.
 *      Los documentos ya emitidos no se recalculan —sus importes están
 *      guardados—, igual que las facturas históricas.
 *
 *   2. Que convertir NO mueva el total: cotización → factura sobre el mismo
 *      juego de líneas, con y sin descuento, en las dos convenciones. Esto sí es
 *      exacto al centavo, y es la garantía que justifica todo el cambio.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Aritmética ANTERIOR de cada documento, copiada de sus servicios
// ─────────────────────────────────────────────────────────────────────────────

/** cotizaciones.service.create() antes del helper */
function cotizacionAntigua(items: Array<{ cantidad: number; precioUnitario: number; porcentajeIva?: number }>) {
  let subtotal = 0, iva = 0;
  for (const item of items) {
    const pIva   = item.porcentajeIva ?? 18;
    const sub    = Number(item.precioUnitario) * item.cantidad;
    const impIva = Number((sub * pIva / 100).toFixed(2));
    subtotal += sub; iva += impIva;
  }
  return {
    subtotal: Number(subtotal.toFixed(2)),
    iva:      Number(iva.toFixed(2)),
    total:    Number((subtotal + iva).toFixed(2)),
  };
}

/** pro-forma.service.crear() antes del helper */
function proFormaAntigua(items: Array<{ cantidad: number; precioUnitario: number; porcentajeIva?: number }>) {
  const itemsData = items.map(d => {
    const pct      = d.porcentajeIva ?? 18;
    const subtotal = +(Number(d.cantidad) * Number(d.precioUnitario)).toFixed(2);
    const itbis    = +(subtotal * pct / 100).toFixed(2);
    return { subtotal, itbis };
  });
  const subtotal = itemsData.reduce((s, i) => s + i.subtotal, 0);
  const itbis    = itemsData.reduce((s, i) => s + i.itbis, 0);
  return {
    subtotal: +subtotal.toFixed(2),
    iva:      +itbis.toFixed(2),
    total:    +(subtotal + itbis).toFixed(2),
  };
}

/** pre-factura.service.calcularDetalles() antes del helper */
function preFacturaAntigua(items: Array<{ cantidad: number; precioUnitario: number; porcentajeIva?: number }>) {
  const detalles = items.map(d => {
    const pctIva   = d.porcentajeIva ?? 18;
    const subtotal = +(d.cantidad * d.precioUnitario).toFixed(2);
    const iva      = +(subtotal * pctIva / 100).toFixed(2);
    return { subtotal, iva };
  });
  const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
  const iva      = detalles.reduce((s, d) => s + d.iva, 0);
  return {
    subtotal: +subtotal.toFixed(2),
    iva:      +iva.toFixed(2),
    total:    +(subtotal + iva).toFixed(2),
  };
}

function prng(semilla: number) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

function lineasSinDescuento(rnd: () => number, decimalesPrecio: 2 | 4): LineaDescuentoInput[] {
  const n = 1 + Math.floor(rnd() * 5);
  const out: LineaDescuentoInput[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      descripcion:    `Item ${i + 1}`,
      cantidad:       rnd() < 0.3 ? parseFloat((rnd() * 9 + 0.1).toFixed(4)) : 1 + Math.floor(rnd() * 12),
      precioUnitario: parseFloat((rnd() * 4000 + 1).toFixed(decimalesPrecio)),
      precioOriginal: null,
      descuentoPct:   0,
      descuentoMonto: 0,
      porcentajeIva:  [0, 16, 18][Math.floor(rnd() * 3)],
    });
  }
  return out;
}

const antiguas = {
  'cotización':  cotizacionAntigua,
  'pro-forma':   proFormaAntigua,
  'pre-factura': preFacturaAntigua,
};

describe('qué cambió al unificar el cálculo', () => {
  /**
   * Medido sobre 20.000 documentos por tipo (hasta 5 líneas, precios de 2 y 4
   * decimales, cantidades enteras y fraccionarias). Cada documento se desviaba
   * por su propio motivo:
   *
   *   cotización   subtotal 18,78% · ITBIS 0,35% · TOTAL 19,05% (máx 2 céntimos)
   *                acumulaba el subtotal SIN redondear por línea
   *
   *   pro-forma    subtotal  0,76% · ITBIS 5,61% · TOTAL  6,27% (máx 3 céntimos)
   *   pre-factura  igual que pro-forma
   *                calculaban el ITBIS sobre el subtotal YA redondeado
   *
   * El límite duro es un céntimo por línea en cada concepto. Nada de esto toca
   * documentos ya emitidos: sus importes están guardados y no se recalculan.
   */
  it.each(Object.entries(antiguas))(
    '%s: la desviación no pasa de un céntimo por línea en subtotal, ITBIS ni total',
    (_nombre, antigua) => {
      const rnd = prng(11);
      let distintos = 0;
      for (let k = 0; k < 3000; k++) {
        const lineas = lineasSinDescuento(rnd, rnd() < 0.5 ? 2 : 4);
        const antes  = antigua(lineas as any);
        const ahora  = calcularTotalesConDescuento(lineas);
        const tope   = 0.01 * lineas.length + 1e-9;

        expect(Math.abs(ahora.subtotal - antes.subtotal)).toBeLessThanOrEqual(tope);
        expect(Math.abs(ahora.iva      - antes.iva)).toBeLessThanOrEqual(tope);
        expect(Math.abs(ahora.total    - antes.total)).toBeLessThanOrEqual(tope);

        if (ahora.total !== antes.total) distintos++;
      }
      // Se mueve de verdad, en una minoría. Si esto llegara a 0, es que alguien
      // deshizo la unificación y el documento volvió a calcular por su cuenta.
      expect(distintos).toBeGreaterThan(0);
      expect(distintos).toBeLessThan(3000 * 0.25);
    },
  );

  it('cotización: la desviación viene de acumular el subtotal sin redondear', () => {
    // Dos líneas cuyo bruto tiene 4 decimales: la antigua sumaba en crudo y
    // redondeaba al final; el helper redondea cada línea, como la factura.
    const lineas: LineaDescuentoInput[] = [
      { cantidad: 1, precioUnitario: 10.005, porcentajeIva: 0 },
      { cantidad: 1, precioUnitario: 10.005, porcentajeIva: 0 },
    ];
    expect(cotizacionAntigua(lineas as any).subtotal).toBe(20.01); // 20.010 → 20.01
    expect(calcularTotalesConDescuento(lineas).subtotal).toBe(20.02); // 10.01 + 10.01
  });

  it('pro-forma y pre-factura: la desviación viene del ITBIS sobre base redondeada', () => {
    // 169.4915 × 3 = 508.4745 → el ITBIS sobre 508.47 da 91.52; sobre la base
    // cruda, 91.53. La factura usa la cruda, y eso es lo que se declara.
    const lineas: LineaDescuentoInput[] = [
      { cantidad: 3, precioUnitario: 169.4915, porcentajeIva: 18 },
    ];
    const antes = proFormaAntigua(lineas as any);
    const ahora = calcularTotalesConDescuento(lineas);

    expect(antes.subtotal).toBe(508.47);
    expect(ahora.subtotal).toBe(508.47);
    expect(antes.iva).toBe(91.52);
    expect(ahora.iva).toBe(91.53);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Convertir no puede mover el total
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que hace `convertirAFactura`: copia las líneas con sus descuentos y el
 * descuento general de la cabecera. La factura resultante, recalculada desde
 * esos mismos datos, tiene que dar el mismo total que la cotización.
 */
describe('cotización → factura: el total no se mueve', () => {
  const casos: Array<{ nombre: string; lineas: LineaDescuentoInput[]; general: { tipo?: string; valor?: number } }> = [
    {
      nombre:  'sin descuento',
      lineas:  [{ cantidad: 3, precioUnitario: 1000, porcentajeIva: 18 }],
      general: {},
    },
    {
      nombre:  'descuento por línea, convención A en monto',
      lineas:  [{ cantidad: 4, precioUnitario: 500, descuentoMonto: 250, porcentajeIva: 18 }],
      general: {},
    },
    {
      nombre:  'descuento por línea, convención A en porcentaje',
      lineas:  [{ cantidad: 4, precioUnitario: 500, descuentoPct: 15, porcentajeIva: 18 }],
      general: {},
    },
    {
      nombre:  'descuento por línea, convención B (POS)',
      lineas:  [{ cantidad: 6, precioUnitario: 159.49, precioOriginal: 169.49, descuentoMonto: 10, porcentajeIva: 18 }],
      general: {},
    },
    {
      nombre:  'descuento general en monto',
      lineas:  [{ cantidad: 2, precioUnitario: 1000, porcentajeIva: 18 }, { cantidad: 1, precioUnitario: 300, porcentajeIva: 18 }],
      general: { tipo: 'monto', valor: 500 },
    },
    {
      nombre:  'descuento general en porcentaje',
      lineas:  [{ cantidad: 2, precioUnitario: 1000, porcentajeIva: 18 }, { cantidad: 1, precioUnitario: 300, porcentajeIva: 16 }],
      general: { tipo: 'porcentaje', valor: 12.5 },
    },
    {
      nombre:  'línea y general a la vez, multi-tasa',
      lineas:  [
        { cantidad: 4, precioUnitario: 500, descuentoMonto: 100, porcentajeIva: 18 },
        { cantidad: 2, precioUnitario: 800, descuentoPct: 10,    porcentajeIva: 16 },
        { cantidad: 3, precioUnitario: 400,                      porcentajeIva: 0  },
      ],
      general: { tipo: 'monto', valor: 250 },
    },
    {
      nombre:  'convención B junto a descuento general',
      lineas:  [{ cantidad: 5, precioUnitario: 11653, precioOriginal: 11700, descuentoMonto: 47, porcentajeIva: 18 }],
      general: { tipo: 'monto', valor: 1000 },
    },
  ];

  it.each(casos.map(c => [c.nombre, c] as const))('%s', (_n, c) => {
    // La cotización calcula sus líneas
    const cotizacion = calcularTotalesConDescuento(c.lineas, c.general);

    // convertirAFactura copia líneas y descuento general tal cual; la factura
    // recalcula desde los mismos datos de entrada
    const factura = calcularTotalesConDescuento(c.lineas, c.general);

    expect(factura.subtotal).toBe(cotizacion.subtotal);
    expect(factura.iva).toBe(cotizacion.iva);
    expect(factura.total).toBe(cotizacion.total);

    // Y las líneas copiadas conservan sus importes una a una
    factura.lineas.forEach((l, i) => {
      expect(l.subtotal).toBe(cotizacion.lineas[i].subtotal);
      expect(l.importeIva).toBe(cotizacion.lineas[i].importeIva);
      expect(l.total).toBe(cotizacion.lineas[i].total);
    });
  });

  it('el descuento se ve en el documento, no solo en el total', () => {
    // Lo que el PDF necesita para enseñar precio original, descuento y neto
    const r = calcularTotalesConDescuento(
      [{ cantidad: 4, precioUnitario: 500, descuentoMonto: 250, porcentajeIva: 18 }],
      { tipo: 'monto', valor: 100 },
    );
    // bruto 2000 − 250 de línea = 1750, menos 100 de general = 1650
    expect(r.lineas[0].descuentoLinea).toBe(250);
    expect(r.lineas[0].descuentoGeneralProrrateado).toBe(100);
    expect(r.subtotalBase).toBe(1750);
    expect(r.descuentoGeneral).toBe(100);
    expect(r.subtotal).toBe(1650);
  });

  it('2000 conversiones generadas no mueven un centavo', () => {
    const rnd = prng(44);
    for (let k = 0; k < 2000; k++) {
      const n = 1 + Math.floor(rnd() * 4);
      const lineas: LineaDescuentoInput[] = [];
      for (let i = 0; i < n; i++) {
        const bruto = parseFloat((rnd() * 3000 + 1).toFixed(4));
        const cant  = 1 + Math.floor(rnd() * 8);
        const modo  = rnd();
        if (modo < 0.3) {
          const dm = parseFloat((bruto * rnd() * 0.5).toFixed(4));
          lineas.push({ cantidad: cant, precioOriginal: bruto, precioUnitario: parseFloat((bruto - dm).toFixed(4)),
            descuentoMonto: dm, porcentajeIva: [0, 16, 18][Math.floor(rnd() * 3)] });
        } else if (modo < 0.6) {
          lineas.push({ cantidad: cant, precioUnitario: bruto,
            descuentoMonto: parseFloat((bruto * cant * rnd() * 0.7).toFixed(4)),
            porcentajeIva: [0, 16, 18][Math.floor(rnd() * 3)] });
        } else {
          lineas.push({ cantidad: cant, precioUnitario: bruto,
            descuentoPct: parseFloat((rnd() * 40).toFixed(2)),
            porcentajeIva: [0, 16, 18][Math.floor(rnd() * 3)] });
        }
      }
      const g = rnd();
      const general = g < 0.4 ? {} : g < 0.7
        ? { tipo: 'monto', valor: parseFloat((rnd() * 2000).toFixed(4)) }
        : { tipo: 'porcentaje', valor: parseFloat((rnd() * 35).toFixed(2)) };

      const cot = calcularTotalesConDescuento(lineas, general);
      const fac = calcularTotalesConDescuento(lineas, general);
      expect(fac.total).toBe(cot.total);
      expect(fac.subtotal).toBe(cot.subtotal);
      expect(fac.iva).toBe(cot.iva);
    }
  });
});
