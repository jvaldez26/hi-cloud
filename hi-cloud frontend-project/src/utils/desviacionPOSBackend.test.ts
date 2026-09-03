import { describe, it, expect } from 'vitest';
import { calcularTotalesCarritoPOS, type ItemCarritoPOS, type OpcionesCarritoPOS } from './totalesCarritoPOS';

/**
 * Cuánto se separan el total que enseña la caja y el que guarda el backend.
 *
 * El POS calcula la base de una línea como `(precio − desc) × cantidad`, de una
 * sola operación. El backend, en convención B, hace
 * `precioOriginal × cantidad − round2(desc × cantidad)`. Son dos redondeos
 * distintos, y por eso algunos documentos se separan un céntimo o dos.
 *
 * Medido el 2026-09-02 sobre 19.780 carritos:
 *
 *     exactos              81,70%
 *     1 céntimo            15,55%
 *     más de 1 céntimo      2,75%   peor caso RD$0,05
 *     ────
 *     con descuento de línea   22,93% desviados
 *     sin descuento de línea    6,30% desviados
 *
 * Imprime esos números en cada corrida y además pone un TECHO: si alguien toca
 * un redondeo y la desviación empeora, esto falla. No afirma que el estado
 * actual sea bueno —no lo es del todo—, afirma que no puede ir a peor sin que
 * alguien se entere.
 *
 * Arreglarlo del todo es alinear el redondeo del POS con el del backend, y eso
 * cambia lo que se cobra en caja: decisión aparte, con estos números delante.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** El helper del backend, convención B, transcrito */
function backend(lineas: Array<{ cantidad: number; precioUnitario: number; precioOriginal?: number | null; descuentoMonto?: number | null; porcentajeIva: number }>,
                 dg: { tipo?: string | null; valor?: number | null } = {}) {
  const calc: Array<{ subtotal: number; baseRaw: number; pct: number }> = [];
  let sb = 0;
  for (const it of lineas) {
    const dm = Number(it.descuentoMonto ?? 0);
    let precioRaw: number, descLinea = 0;
    if (it.precioOriginal != null && dm > 0) {
      precioRaw = Number(it.precioOriginal) * it.cantidad;
      descLinea = round2(dm * it.cantidad);
    } else {
      precioRaw = Number(it.precioUnitario) * it.cantidad;
      const b = round2(precioRaw);
      if (dm > 0) descLinea = round2(Math.min(dm, b));
    }
    const s = round2(round2(precioRaw) - descLinea);
    sb += s;
    calc.push({ subtotal: s, baseRaw: precioRaw - descLinea, pct: Number(it.porcentajeIva) });
  }
  sb = round2(sb);
  let d = 0; const v = Number(dg.valor ?? 0);
  if (dg.tipo === 'monto' && v > 0) d = round2(Math.min(v, sb));
  let sT = 0, iT = 0;
  for (const x of calc) {
    const pp = sb > 0 ? round2((x.subtotal / sb) * d) : 0;
    const sf = round2(x.subtotal - pp);
    const rf = x.subtotal > 0 ? x.baseRaw * (sf / x.subtotal) : sf;
    sT += sf; iT += round2(rf * (x.pct / 100));
  }
  return round2(round2(sT) + round2(iT));
}

function prng(s0: number) { let s = s0 >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; }

describe('desviación POS ↔ backend', () => {
  it('mide cuánto se separan, y no deja que empeore', () => {
    const rnd = prng(20260902);
    let n = 0, exactos = 0, unCentavo = 0, mas = 0, peor = 0;
    const conDescuento = { n: 0, desviados: 0 };
    const sinDescuento = { n: 0, desviados: 0 };

    for (let k = 0; k < 20000; k++) {
      const nl = 1 + Math.floor(rnd() * 5);
      const cart: ItemCarritoPOS[] = [];
      for (let j = 0; j < nl; j++) {
        const iva = [0, 16, 18][Math.floor(rnd() * 3)];
        const precio = parseFloat((rnd() * 3000 + 1).toFixed(2));
        const cant = rnd() < 0.25 ? parseFloat((rnd() * 8 + 0.05).toFixed(4)) : 1 + Math.floor(rnd() * 10);
        const desc = rnd() < 0.4 ? parseFloat((precio * rnd() * 0.5).toFixed(4)) : 0;
        cart.push({ precio, cantidad: cant, descuentoMonto: desc, produto: { porcentajeIva: iva } });
      }
      const g = rnd();
      const o: OpcionesCarritoPOS = {
        descGlobal: g < 0.5 ? '0' : String((rnd() * 2000).toFixed(2)),
        descGlobalTipo: 'fijo', precioIncluyeItbis: false, tipoNcf: 'E32',
      };
      const pos = calcularTotalesCarritoPOS(cart, o);
      if (!(pos.totalEfectivo > 0)) continue;
      n++;

      // Lo que el POS manda hoy: convención B, descuento por unidad
      const payload = cart.map(i => ({
        cantidad: i.cantidad,
        precioUnitario: parseFloat((i.precio - i.descuentoMonto).toFixed(4)),
        ...(i.descuentoMonto > 0
          ? { precioOriginal: parseFloat(i.precio.toFixed(4)), descuentoMonto: parseFloat(i.descuentoMonto.toFixed(4)) }
          : {}),
        porcentajeIva: Number(i.produto.porcentajeIva ?? 18),
      }));
      const dg = pos.descGlobalMonto > 0 ? { tipo: 'monto', valor: pos.descGlobalMonto } : {};
      const d = Math.abs(round2(backend(payload, dg) - pos.totalEfectivo));

      const hayDesc = cart.some(i => i.descuentoMonto > 0);
      const grupo = hayDesc ? conDescuento : sinDescuento;
      grupo.n++;
      if (d === 0) exactos++;
      else { grupo.desviados++; if (d <= 0.011) unCentavo++; else { mas++; peor = Math.max(peor, d); } }
    }

    const pct = (x: number) => (x * 100 / n).toFixed(2) + '%';
    console.log('\n  ── Desviación POS ↔ backend, ' + n + ' carritos ──');
    console.log('    exactos            : ' + exactos + '  (' + pct(exactos) + ')');
    console.log('    1 céntimo          : ' + unCentavo + '  (' + pct(unCentavo) + ')');
    console.log('    más de 1 céntimo   : ' + mas + '  (' + pct(mas) + ')   peor: RD$' + peor.toFixed(2));
    console.log('    ─────');
    console.log('    con descuento línea: ' + conDescuento.desviados + '/' + conDescuento.n +
                '  (' + (conDescuento.desviados * 100 / (conDescuento.n || 1)).toFixed(2) + '% desviados)');
    console.log('    sin descuento línea: ' + sinDescuento.desviados + '/' + sinDescuento.n +
                '  (' + (sinDescuento.desviados * 100 / (sinDescuento.n || 1)).toFixed(2) + '% desviados)\n');

    // ── Techos ────────────────────────────────────────────────────────────
    // Márgenes sobre lo medido el 2026-09-02 (81,70% / 2,75% / RD$0,05). No
    // dicen "esto está bien": dicen que si empeora, alguien tiene que mirarlo.
    expect(exactos / n).toBeGreaterThan(0.78);
    expect(mas / n).toBeLessThan(0.04);
    expect(peor).toBeLessThanOrEqual(0.10);
  });
});
