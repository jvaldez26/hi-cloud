import { describe, it, expect } from 'vitest';
import {
  descuentoDeLinea,
  calcularTotalesDocumento,
  type LineaDocumento,
  type DescuentoGeneral,
} from './totalesDocumento';

/**
 * Lo que la pantalla enseña tiene que ser lo que el backend guarda.
 *
 * El frontend replica la aritmética porque son dos proyectos npm distintos y no
 * puede importar el helper del backend. Esa copia es justo el riesgo: si una de
 * las dos cambia y la otra no, el usuario ve un total y se guarda otro.
 *
 * Por eso el test principal no comprueba números concretos, sino que las DOS
 * fórmulas coinciden — con la del backend transcrita literalmente aquí abajo,
 * en `backendDescuentoDocumento`, para que la comparación sea real.
 *
 * Si alguien toca `common/calculo/descuento-documento.ts` y no toca esta copia,
 * lo que falla es esta prueba, que es donde se quiere que falle.
 */

// ─────────────────────────────────────────────────────────────────────────────
// COPIA LITERAL de hi-cloud backend-project/backend/src/common/calculo/
// descuento-documento.ts (calcularTotalesConDescuento). No editar para
// "arreglar" un fallo: si esto y el util divergen, hay que decidir cuál de los
// dos está mal, y si el que cambia es el backend, actualizar esta copia EN EL
// MISMO commit que la del util.
// ─────────────────────────────────────────────────────────────────────────────
function backendDescuentoDocumento(
  lineas: Array<{
    cantidad: number; precioUnitario: number; precioOriginal?: number | null;
    descuentoPct?: number | null; descuentoMonto?: number | null; porcentajeIva: number;
  }>,
  descuentoGeneral: { tipo?: string | null; valor?: number | null } = {},
) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const calculadas: Array<{ subtotal: number; baseRaw: number; porcentajeIva: number }> = [];
  let subtotalBase = 0;

  for (const item of lineas) {
    const dm = Number(item.descuentoMonto ?? 0);
    const dp = Number(item.descuentoPct ?? 0);
    let precioRaw: number;
    let descLinea = 0;

    if (item.precioOriginal != null && dm > 0) {
      precioRaw = Number(item.precioOriginal) * item.cantidad;
      descLinea = r2(dm * item.cantidad);
    } else {
      precioRaw = Number(item.precioUnitario) * item.cantidad;
      const brutoA = r2(precioRaw);
      if (dm > 0) descLinea = r2(Math.min(dm, brutoA));
      else if (dp > 0) descLinea = r2(brutoA * (dp / 100));
    }

    const subtotalLinea = r2(r2(precioRaw) - descLinea);
    subtotalBase += subtotalLinea;
    calculadas.push({
      subtotal: subtotalLinea,
      baseRaw:  precioRaw - descLinea,
      porcentajeIva: Number(item.porcentajeIva),
    });
  }

  subtotalBase = r2(subtotalBase);

  let descGeneral = 0;
  const dgv = Number(descuentoGeneral.valor ?? 0);
  if (descuentoGeneral.tipo === 'monto' && dgv > 0) {
    descGeneral = r2(Math.min(dgv, subtotalBase));
  } else if (descuentoGeneral.tipo === 'porcentaje' && dgv > 0) {
    descGeneral = r2(subtotalBase * (dgv / 100));
  }

  let subtotalDoc = 0, ivaDoc = 0;
  for (const d of calculadas) {
    const descProp = subtotalBase > 0 ? r2((d.subtotal / subtotalBase) * descGeneral) : 0;
    const subtotFinal = r2(d.subtotal - descProp);
    const rawFinal = d.subtotal > 0 ? d.baseRaw * (subtotFinal / d.subtotal) : subtotFinal;
    subtotalDoc += subtotFinal;
    ivaDoc      += r2(rawFinal * (d.porcentajeIva / 100));
  }
  subtotalDoc = r2(subtotalDoc);
  ivaDoc      = r2(ivaDoc);

  return { subtotalBase, descGeneral, subtotal: subtotalDoc, iva: ivaDoc, total: r2(subtotalDoc + ivaDoc) };
}

/** El formulario envía convención A: precio bruto + descuento total de línea */
function aPayloadBackend(l: LineaDocumento) {
  const desc = descuentoDeLinea(l);
  return {
    cantidad:       l.cantidad,
    precioUnitario: l.precioUnitario,
    porcentajeIva:  l.porcentajeIva,
    ...(desc > 0
      ? l.descuentoTipo === 'pct'
        ? { descuentoPct: Number(l.descuentoValor) }
        : { descuentoMonto: desc }
      : {}),
  };
}

function prng(semilla: number) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('descuentoDeLinea', () => {
  it('en monto descuenta lo tecleado', () => {
    expect(descuentoDeLinea({ cantidad: 4, precioUnitario: 950, porcentajeIva: 18,
      descuentoTipo: 'monto', descuentoValor: 380 })).toBe(380);
  });

  it('en porcentaje descuenta sobre el bruto de la línea, no sobre el precio', () => {
    // 1250 × 2 = 2500 → 10% = 250, no 125
    expect(descuentoDeLinea({ cantidad: 2, precioUnitario: 1250, porcentajeIva: 18,
      descuentoTipo: 'pct', descuentoValor: 10 })).toBe(250);
  });

  it('nunca se pasa del bruto de la línea', () => {
    // Sin el tope el subtotal se va a negativo y la factura acaba en negativo
    expect(descuentoDeLinea({ cantidad: 2, precioUnitario: 50, porcentajeIva: 18,
      descuentoTipo: 'monto', descuentoValor: 9999 })).toBe(100);
  });

  it('el porcentaje se topa al 100', () => {
    expect(descuentoDeLinea({ cantidad: 1, precioUnitario: 100, porcentajeIva: 18,
      descuentoTipo: 'pct', descuentoValor: 250 })).toBe(100);
  });

  it('un valor negativo no aumenta el importe', () => {
    expect(descuentoDeLinea({ cantidad: 1, precioUnitario: 100, porcentajeIva: 18,
      descuentoTipo: 'monto', descuentoValor: -50 })).toBe(0);
  });

  it('sin descuento devuelve 0', () => {
    expect(descuentoDeLinea({ cantidad: 3, precioUnitario: 100, porcentajeIva: 18 })).toBe(0);
  });
});

describe('calcularTotalesDocumento — casos con nombre', () => {
  it('el ejemplo verificado en pantalla: 950×4 −380 −500 global', () => {
    const r = calcularTotalesDocumento(
      [{ cantidad: 4, precioUnitario: 950, porcentajeIva: 18,
         descuentoTipo: 'monto', descuentoValor: 380 }],
      { tipo: 'monto', valor: 500 },
    );
    expect(r.subtotalBase).toBe(3420);          // 3800 − 380
    expect(r.descuentoLineasTotal).toBe(380);
    expect(r.descGeneral).toBe(500);
    expect(r.subtotal).toBe(2920);              // 3420 − 500
    expect(r.iva).toBe(525.60);
    expect(r.total).toBe(3445.60);
  });

  it('sin descuentos es el cálculo de toda la vida', () => {
    const r = calcularTotalesDocumento([
      { cantidad: 3, precioUnitario: 100, porcentajeIva: 18 },
      { cantidad: 1, precioUnitario: 50,  porcentajeIva: 0  },
    ]);
    expect(r.subtotal).toBe(350);
    expect(r.iva).toBe(54);
    expect(r.total).toBe(404);
  });

  it('el descuento general no puede pasarse del subtotal', () => {
    const r = calcularTotalesDocumento(
      [{ cantidad: 1, precioUnitario: 100, porcentajeIva: 18 }],
      { tipo: 'monto', valor: 5000 },
    );
    expect(r.descGeneral).toBe(100);
    expect(r.total).toBe(0);
  });

  it('el general se reparte en proporción, no a partes iguales', () => {
    // 3000 y 1000 → al primero le toca el 75% del descuento
    const r = calcularTotalesDocumento([
      { cantidad: 1, precioUnitario: 3000, porcentajeIva: 18 },
      { cantidad: 1, precioUnitario: 1000, porcentajeIva: 18 },
    ], { tipo: 'monto', valor: 400 });
    expect(r.lineas[0].descProp).toBe(300);
    expect(r.lineas[1].descProp).toBe(100);
  });

  it('un documento sin líneas no divide entre cero', () => {
    const r = calcularTotalesDocumento([], { tipo: 'monto', valor: 100 });
    expect(r.total).toBe(0);
    expect(r.descGeneral).toBe(0);
  });

  it('el ITBIS sale de la base cruda, no de la redondeada', () => {
    // 169.4915 × 3 = 508.4745 → sobre 508.47 daría 91.52; sobre la cruda, 91.53.
    // El backend usa la cruda: es lo que se declara.
    const r = calcularTotalesDocumento(
      [{ cantidad: 3, precioUnitario: 169.4915, porcentajeIva: 18 }],
    );
    expect(r.subtotal).toBe(508.47);
    expect(r.iva).toBe(91.53);
  });
});

describe('la pantalla y el backend calculan lo mismo', () => {
  it('3000 documentos generados coinciden al céntimo', () => {
    const rnd = prng(20260902);
    let conDescuentoLinea = 0, conGeneral = 0, multiTasa = 0;

    for (let k = 0; k < 3000; k++) {
      const n = 1 + Math.floor(rnd() * 5);
      const lineas: LineaDocumento[] = [];
      for (let i = 0; i < n; i++) {
        const modo = rnd();
        lineas.push({
          cantidad: 1 + Math.floor(rnd() * 12),
          precioUnitario: parseFloat((rnd() * 4000 + 1).toFixed(rnd() < 0.5 ? 2 : 4)),
          porcentajeIva: [0, 16, 18][Math.floor(rnd() * 3)],
          ...(modo < 0.35
            ? { descuentoTipo: 'monto' as const, descuentoValor: parseFloat((rnd() * 2000).toFixed(2)) }
            : modo < 0.65
              ? { descuentoTipo: 'pct' as const, descuentoValor: parseFloat((rnd() * 40).toFixed(2)) }
              : {}),
        });
      }
      const g = rnd();
      const general: DescuentoGeneral = g < 0.4 ? {}
        : g < 0.7 ? { tipo: 'monto',      valor: parseFloat((rnd() * 3000).toFixed(2)) }
                  : { tipo: 'porcentaje', valor: parseFloat((rnd() * 35).toFixed(2)) };

      const pantalla = calcularTotalesDocumento(lineas, general);
      const backend  = backendDescuentoDocumento(
        lineas.map(aPayloadBackend),
        { tipo: general.tipo ?? null, valor: general.valor ?? null },
      );

      expect(pantalla.subtotalBase).toBe(backend.subtotalBase);
      expect(pantalla.descGeneral).toBe(backend.descGeneral);
      expect(pantalla.subtotal).toBe(backend.subtotal);
      expect(pantalla.iva).toBe(backend.iva);
      expect(pantalla.total).toBe(backend.total);

      if (lineas.some(l => l.descuentoValor)) conDescuentoLinea++;
      if (general.tipo) conGeneral++;
      if (new Set(lineas.map(l => l.porcentajeIva)).size > 1) multiTasa++;
    }

    // Que la corrida haya ejercitado de verdad los tres caminos
    expect(conDescuentoLinea).toBeGreaterThan(500);
    expect(conGeneral).toBeGreaterThan(500);
    expect(multiTasa).toBeGreaterThan(500);
  });
});
