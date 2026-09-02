import { calcularTotalesConDescuento, LineaDescuentoInput } from './descuento-documento';
import facturasProd from './__fixtures__/facturas-descuento-prod.json';
import facturasProdTodas from './__fixtures__/facturas-descuento-prod-todas.json';

/**
 * Prueba de CARACTERIZACIÓN del cálculo de descuentos.
 *
 * No comprueba que el cálculo sea "correcto" según una teoría: comprueba que
 * siga dando EXACTAMENTE lo que ya dio en producción. Existe para poder extraer
 * el bloque de `facturas.service.ts` a un helper compartido sin mover un
 * centavo. Si falla, la extracción cambió comportamiento — no se sigue.
 *
 * Dos frentes:
 *
 *  1. Facturas REALES de producción (fixture `facturas-descuento-prod.json`:
 *     24 facturas / 37 líneas). Los importes esperados no los generó esta
 *     prueba — los generó el código en producción y están guardados en la base.
 *
 *     El fixture NO son todas las facturas con descuento de producción: son las
 *     66 existentes menos 42 que el propio código de HEAD tampoco reproduce, y
 *     que por tanto no caracterizan el comportamiento actual. De esas 42:
 *
 *       · 38 se calcularon con la fórmula ANTERIOR a `24883a94`
 *         ("fix(facturas): corregir doble-descuento en subtotal y reimpresión
 *         POS", 2026-08-11), que ignoraba `precioOriginal` y trataba
 *         `descuentoMonto` como total de línea. 35 son de julio y 3 del propio
 *         11 de agosto, antes del despliegue. NINGUNA es posterior a esa fecha:
 *         el corte es exacto y confirma que son histórico, no un desajuste vivo.
 *         Sus importes ya están emitidos y declarados; nada los recalcula.
 *
 *       · 4 fallan por UN centavo (FAC-139, FAC-143, FAC-147 del 11-ago y
 *         FAC-769 del 23-ago). No es el cálculo: `factura_detalles.precioUnitario`
 *         y `precioOriginal` son NUMERIC(12,2) mientras el POS envía 4 decimales,
 *         así que el input reconstruido desde la base ya no es el que entró al
 *         cálculo. Con el valor de 4dp original el importe cuadra exacto.
 *
 *     Consecuencia a tener presente: la muestra real cubre bien el descuento
 *     GENERAL (21 facturas) pero solo deja 1 factura de convención B, porque
 *     desde el arreglo de agosto casi no se han emitido ventas con descuento por
 *     ítem. Ese hueco lo cubre el frente 2.
 *
 *  2. Prueba DIFERENCIAL contra `calculoOriginalCongelado` — copia literal del
 *     bloque que vivía en facturas.service.ts. Cubre lo que producción no tiene:
 *     descuento general en PORCENTAJE, convención B combinada con descuento
 *     general, y facturas multi-tasa de ITBIS. Es la garantía fuerte de que la
 *     extracción no movió un centavo, y no es circular: compara el helper contra
 *     el código anterior, no contra sí mismo.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Facturas reales de producción
// ─────────────────────────────────────────────────────────────────────────────

interface CasoProd {
  caso: string;
  folio: string;
  nLineas: number;
  entrada: {
    descuentoGeneralTipo: string | null;
    descuentoGeneralValor: number | null;
    lineas: Array<{
      descripcion: string;
      cantidad: number;
      precioUnitario: number;
      precioOriginal: number | null;
      descuentoPct: number;
      descuentoMonto: number;
      porcentajeIva: number;
    }>;
  };
  esperado: {
    subtotal: number;
    iva: number;
    total: number;
    lineas: Array<{ subtotal: number; importeIva: number; total: number }>;
  };
}

const casosProd = facturasProd as unknown as CasoProd[];

describe('calcularTotalesConDescuento — facturas reales de producción', () => {
  it('el fixture cubre las dos convenciones de línea y el descuento general', () => {
    const casos = casosProd.map(c => c.caso);
    expect(casos).toContain('linea-convencion-B');
    expect(casos).toContain('linea-convencion-A-monto');
    expect(casos).toContain('linea-convencion-A-pct');
    expect(casos).toContain('general-monto');
    expect(casosProd).toHaveLength(24);
    expect(casosProd.reduce((s, c) => s + c.nLineas, 0)).toBe(37);
  });

  it.each(casosProd.map(c => [c.folio, c.caso, c] as const))(
    '%s (%s) — reproduce los importes guardados en producción',
    (_folio, _caso, c) => {
      const res = calcularTotalesConDescuento(c.entrada.lineas, {
        tipo:  c.entrada.descuentoGeneralTipo,
        valor: c.entrada.descuentoGeneralValor,
      });

      expect(res.subtotal).toBe(c.esperado.subtotal);
      expect(res.iva).toBe(c.esperado.iva);
      expect(res.total).toBe(c.esperado.total);

      expect(res.lineas).toHaveLength(c.esperado.lineas.length);
      c.esperado.lineas.forEach((esp, i) => {
        expect(res.lineas[i].subtotal).toBe(esp.subtotal);
        expect(res.lineas[i].importeIva).toBe(esp.importeIva);
        expect(res.lineas[i].total).toBe(esp.total);
      });
    },
  );

  it('la suma de las líneas cuadra con la cabecera en todas las facturas reales', () => {
    for (const c of casosProd) {
      const res = calcularTotalesConDescuento(c.entrada.lineas, {
        tipo:  c.entrada.descuentoGeneralTipo,
        valor: c.entrada.descuentoGeneralValor,
      });
      const sumaSub = Math.round(res.lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
      const sumaIva = Math.round(res.lineas.reduce((s, l) => s + l.importeIva, 0) * 100) / 100;
      expect(sumaSub).toBe(res.subtotal);
      expect(sumaIva).toBe(res.iva);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Diferencial contra el bloque original congelado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * COPIA LITERAL del cálculo tal como estaba en facturas.service.ts antes de la
 * extracción (create(), líneas ~186-285). No tocar: su valor es justamente ser
 * la referencia inmóvil contra la que se compara el helper. Si el helper tiene
 * que cambiar de comportamiento algún día, esta copia se borra en el mismo
 * commit — no se "actualiza".
 */
function calculoOriginalCongelado(
  items: LineaDescuentoInput[],
  descuentoGeneralTipo?: string | null,
  descuentoGeneralValor?: number | null,
) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const detalles: any[] = [];
  let subtotalBase = 0;

  for (const item of items) {
    const porcentajeIva = item.porcentajeIva;
    const dm = Number(item.descuentoMonto ?? 0);
    const dp = Number(item.descuentoPct ?? 0);

    let precioRaw: number;
    let descLinea = 0;

    if (item.precioOriginal != null && dm > 0) {
      const precioOrig = Number(item.precioOriginal);
      const precioNeto = Number(item.precioUnitario);
      const diff = Math.abs((precioOrig - dm) - precioNeto);
      if (diff > 0.05) {
        throw new Error(
          `[precio] "${item.descripcion ?? 'ítem'}": ` +
          `precioOriginal (${precioOrig}) − descuentoMonto (${dm}) ≠ precioUnitario (${precioNeto}) ` +
          `(diff=${diff.toFixed(4)}). El precio enviado ya incluye el descuento.`,
        );
      }
      precioRaw = precioOrig * item.cantidad;
      descLinea = r2(dm * item.cantidad);
    } else {
      precioRaw = Number(item.precioUnitario) * item.cantidad;
      const brutoA = r2(precioRaw);
      if (dm > 0) {
        descLinea = r2(Math.min(dm, brutoA));
      } else if (dp > 0) {
        descLinea = r2(brutoA * (dp / 100));
      }
    }

    const bruto = r2(precioRaw);
    const subtotalLinea = r2(bruto - descLinea);
    subtotalBase += subtotalLinea;

    detalles.push({ porcentajeIva, subtotal: subtotalLinea, importeIva: 0, total: 0 });
    (detalles[detalles.length - 1] as any)._baseRaw = precioRaw - descLinea;
  }

  subtotalBase = r2(subtotalBase);

  let descGeneral = 0;
  const dgt = descuentoGeneralTipo;
  const dgv = Number(descuentoGeneralValor ?? 0);
  if (dgt === 'monto' && dgv > 0) {
    descGeneral = r2(Math.min(dgv, subtotalBase));
  } else if (dgt === 'porcentaje' && dgv > 0) {
    descGeneral = r2(subtotalBase * (dgv / 100));
  }

  let subtotalFactura = 0;
  let ivaFactura = 0;
  for (const d of detalles) {
    const baseRaw: number = (d as any)._baseRaw ?? Number(d.subtotal);
    const subtotNeto = Number(d.subtotal);
    const descProp = subtotalBase > 0
      ? r2((subtotNeto / subtotalBase) * descGeneral)
      : 0;
    const subtotFinal = r2(subtotNeto - descProp);
    const rawFinal = subtotNeto > 0 ? baseRaw * (subtotFinal / subtotNeto) : subtotFinal;
    const ivaLinea = r2(rawFinal * (Number(d.porcentajeIva) / 100));
    d.subtotal = subtotFinal;
    d.importeIva = ivaLinea;
    d.total = r2(subtotFinal + ivaLinea);
    subtotalFactura += subtotFinal;
    ivaFactura += ivaLinea;
  }
  subtotalFactura = r2(subtotalFactura);
  ivaFactura = r2(ivaFactura);

  return {
    detalles: detalles.map(d => ({ subtotal: d.subtotal, importeIva: d.importeIva, total: d.total })),
    subtotal: subtotalFactura,
    iva: ivaFactura,
    total: r2(subtotalFactura + ivaFactura),
  };
}

/** Generador determinista — mismos casos en cada corrida y en CI */
function prng(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function generarCaso(rnd: () => number) {
  const nLineas = 1 + Math.floor(rnd() * 5);
  const tasas = [0, 16, 18];
  const lineas: LineaDescuentoInput[] = [];

  for (let i = 0; i < nLineas; i++) {
    const porcentajeIva = tasas[Math.floor(rnd() * tasas.length)];
    // Cantidades fraccionarias incluidas: producción las tiene (0.86, 6.21)
    const cantidad = rnd() < 0.3
      ? parseFloat((rnd() * 10 + 0.1).toFixed(4))
      : 1 + Math.floor(rnd() * 12);
    const bruto = parseFloat((rnd() * 5000 + 1).toFixed(4));
    const modo = rnd();

    if (modo < 0.35) {
      // Convención B (POS): descuento por unidad, precioUnitario ya neto
      const dm = parseFloat((bruto * rnd() * 0.6).toFixed(4));
      lineas.push({
        descripcion: `Item ${i + 1}`,
        cantidad,
        precioOriginal: bruto,
        precioUnitario: parseFloat((bruto - dm).toFixed(4)),
        descuentoMonto: dm,
        descuentoPct: 0,
        porcentajeIva,
      });
    } else if (modo < 0.6) {
      // Convención A por monto
      lineas.push({
        descripcion: `Item ${i + 1}`,
        cantidad,
        precioUnitario: bruto,
        precioOriginal: null,
        descuentoMonto: parseFloat((bruto * cantidad * rnd() * 0.8).toFixed(4)),
        descuentoPct: 0,
        porcentajeIva,
      });
    } else if (modo < 0.85) {
      // Convención A por porcentaje
      lineas.push({
        descripcion: `Item ${i + 1}`,
        cantidad,
        precioUnitario: bruto,
        precioOriginal: null,
        descuentoMonto: 0,
        descuentoPct: parseFloat((rnd() * 50).toFixed(2)),
        porcentajeIva,
      });
    } else {
      // Sin descuento de línea
      lineas.push({
        descripcion: `Item ${i + 1}`,
        cantidad,
        precioUnitario: bruto,
        precioOriginal: null,
        descuentoMonto: 0,
        descuentoPct: 0,
        porcentajeIva,
      });
    }
  }

  const g = rnd();
  const descuentoGeneral = g < 0.4
    ? { tipo: null as string | null, valor: null as number | null }
    : g < 0.7
      ? { tipo: 'monto', valor: parseFloat((rnd() * 3000).toFixed(4)) }
      : { tipo: 'porcentaje', valor: parseFloat((rnd() * 40).toFixed(2)) };

  return { lineas, descuentoGeneral };
}

describe('calcularTotalesConDescuento — diferencial contra el bloque original', () => {
  it('2000 documentos aleatorios dan importes idénticos al cálculo congelado', () => {
    const rnd = prng(20260902);
    let conGeneralPct = 0, conConvencionB = 0, multiTasa = 0, bMasGeneral = 0;

    for (let n = 0; n < 2000; n++) {
      const { lineas, descuentoGeneral } = generarCaso(rnd);

      const esperado = calculoOriginalCongelado(
        lineas, descuentoGeneral.tipo, descuentoGeneral.valor,
      );
      const obtenido = calcularTotalesConDescuento(lineas, descuentoGeneral);

      expect(obtenido.subtotal).toBe(esperado.subtotal);
      expect(obtenido.iva).toBe(esperado.iva);
      expect(obtenido.total).toBe(esperado.total);
      obtenido.lineas.forEach((l, i) => {
        expect(l.subtotal).toBe(esperado.detalles[i].subtotal);
        expect(l.importeIva).toBe(esperado.detalles[i].importeIva);
        expect(l.total).toBe(esperado.detalles[i].total);
      });

      // Contabilizar la cobertura real de los caminos que producción no tiene
      const tieneB = lineas.some(l => l.precioOriginal != null && Number(l.descuentoMonto) > 0);
      if (descuentoGeneral.tipo === 'porcentaje') conGeneralPct++;
      if (tieneB) conConvencionB++;
      if (tieneB && descuentoGeneral.tipo) bMasGeneral++;
      if (new Set(lineas.map(l => l.porcentajeIva)).size > 1) multiTasa++;
    }

    // Que la corrida haya ejercitado de verdad los huecos de producción
    expect(conGeneralPct).toBeGreaterThan(100);
    expect(conConvencionB).toBeGreaterThan(100);
    expect(bMasGeneral).toBeGreaterThan(100);
    expect(multiTasa).toBeGreaterThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2b. Las 66 facturas reales, contra el bloque original
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El fixture del frente 1 se queda con las 24 facturas que el código actual
 * reproduce. Este comprueba lo otro: que sobre las 66 facturas con descuento que
 * existen en producción — las 24 y también las 42 históricas — el helper dé
 * exactamente lo que daría el bloque anterior. Cierra el hueco de "excluiste 42,
 * ¿y si justo ahí divergía?".
 *
 * Los importes de referencia se calcularon con el bloque de HEAD antes de la
 * extracción, no se leyeron de la base.
 */
interface CasoTodas {
  folio: string;
  fecha: string;
  entrada: {
    descuentoGeneralTipo: string | null;
    descuentoGeneralValor: number | null;
    lineas: LineaDescuentoInput[];
  };
  head: { subtotal: number; iva: number; total: number;
          lineas: Array<{ subtotal: number; importeIva: number; total: number }> } | null;
  lanzaInvariante: boolean;
}

const todasProd = facturasProdTodas as unknown as CasoTodas[];

describe('calcularTotalesConDescuento — las 66 facturas reales contra el bloque original', () => {
  it('el fixture completo trae las 66 facturas con descuento de producción', () => {
    expect(todasProd).toHaveLength(66);
  });

  it.each(todasProd.map(c => [`${c.folio} (${c.fecha})`, c] as const))(
    '%s — el helper da lo mismo que el bloque anterior',
    (_id, c) => {
      if (c.lanzaInvariante) {
        expect(() => calcularTotalesConDescuento(c.entrada.lineas, {
          tipo: c.entrada.descuentoGeneralTipo, valor: c.entrada.descuentoGeneralValor,
        })).toThrow();
        return;
      }
      const res = calcularTotalesConDescuento(c.entrada.lineas, {
        tipo:  c.entrada.descuentoGeneralTipo,
        valor: c.entrada.descuentoGeneralValor,
      });
      expect(res.subtotal).toBe(c.head!.subtotal);
      expect(res.iva).toBe(c.head!.iva);
      expect(res.total).toBe(c.head!.total);
      c.head!.lineas.forEach((h, i) => {
        expect(res.lineas[i].subtotal).toBe(h.subtotal);
        expect(res.lineas[i].importeIva).toBe(h.importeIva);
        expect(res.lineas[i].total).toBe(h.total);
      });
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Invariantes que el cálculo debe cumplir siempre
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularTotalesConDescuento — invariantes', () => {
  it('rechaza la convención B cuando precioOriginal − descuento ≠ precioUnitario', () => {
    expect(() => calcularTotalesConDescuento([{
      descripcion: 'Aceite',
      cantidad: 1,
      precioOriginal: 169.49,
      precioUnitario: 100,      // debería ser 159.49
      descuentoMonto: 10,
      porcentajeIva: 18,
    }])).toThrow(/precioOriginal .* ≠ precioUnitario/);
  });

  it('tolera la desviación de ±0.05 que permite el contrato', () => {
    expect(() => calcularTotalesConDescuento([{
      descripcion: 'Aceite',
      cantidad: 1,
      precioOriginal: 169.49,
      precioUnitario: 159.53,   // 0.04 de desviación
      descuentoMonto: 10,
      porcentajeIva: 18,
    }])).not.toThrow();
  });

  it('el descuento general en monto nunca excede el subtotal', () => {
    const res = calcularTotalesConDescuento(
      [{ cantidad: 1, precioUnitario: 100, porcentajeIva: 18 }],
      { tipo: 'monto', valor: 500 },
    );
    expect(res.descuentoGeneral).toBe(100);
    expect(res.subtotal).toBe(0);
    expect(res.iva).toBe(0);
    expect(res.total).toBe(0);
  });

  it('el descuento de línea por monto nunca excede el bruto de la línea', () => {
    const res = calcularTotalesConDescuento([
      { cantidad: 2, precioUnitario: 50, descuentoMonto: 999, porcentajeIva: 18 },
    ]);
    expect(res.lineas[0].descuentoLinea).toBe(100);
    expect(res.subtotal).toBe(0);
  });

  it('sin descuentos, subtotal e ITBIS son los de siempre', () => {
    const res = calcularTotalesConDescuento([
      { cantidad: 3, precioUnitario: 100, porcentajeIva: 18 },
      { cantidad: 1, precioUnitario: 50,  porcentajeIva: 0  },
    ]);
    expect(res.subtotal).toBe(350);
    expect(res.iva).toBe(54);
    expect(res.total).toBe(404);
  });

  it('un documento sin líneas no rompe la división del prorrateo', () => {
    const res = calcularTotalesConDescuento([], { tipo: 'monto', valor: 100 });
    expect(res.subtotal).toBe(0);
    expect(res.iva).toBe(0);
    expect(res.total).toBe(0);
    expect(res.descuentoGeneral).toBe(0);
  });
});
