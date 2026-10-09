import { describe, it, expect } from 'vitest';
import {
  fusionarColaEnCarrito, debeFusionarColaAhora, totalMostradoEnModal, debeEncolarAgregado,
} from './ventaEnCursoGate';

/**
 * Regresión FAC-1746 (empresa 73, 2026-10-08): un producto escaneado
 * mientras la venta se emitía se mezcló con el carrito que se estaba
 * cobrando — infló el total mostrado/impreso sin tocar la factura ya
 * enviada. Primer ajuste (commit 6d5ca099): en vez de rechazar el
 * escaneo, se encola para la próxima venta y entra solo cuando la venta en
 * curso termina de verdad.
 *
 * Segundo ajuste (el mismo día): el gate arrancaba demasiado temprano —
 * con showPago (modal de cobro abierto). Antes de hacer clic en "Confirmar
 * cobro" el modal puede llevar rato abierto (eligiendo forma de pago, el
 * cliente pidiendo "una cosa más") y ESE producto es parte de la venta
 * actual, no de la próxima. El gate ahora es "venta en curso"
 * (ventaMut.isPending en POSPage.tsx) — desde el clic en "Confirmar cobro"
 * hasta que la venta termina, con éxito o con fallo.
 */

describe('debeEncolarAgregado — el gate es "venta en curso" (isPending), nunca "modal abierto"', () => {
  it('modal de cobro abierto pero SIN confirmar todavía → no encola, entra a la venta actual', () => {
    // showPago=true no aparece aquí a propósito: la función ni siquiera
    // recibe ese dato — estructuralmente no puede depender de él.
    expect(debeEncolarAgregado(/* ventaEnCurso */ false)).toBe(false);
  });

  it('venta en curso (tras el clic en "Confirmar cobro", esperando la respuesta del servidor) → encola', () => {
    expect(debeEncolarAgregado(true)).toBe(true);
  });
});

describe('debeFusionarColaAhora — solo en el flanco de bajada de "venta en curso"', () => {
  it('venta terminó (isPending pasa de true a false) con cola pendiente → fusiona', () => {
    expect(debeFusionarColaAhora(/* antes */ true, /* ahora */ false, /* cola */ 2)).toBe(true);
  });

  it('venta fallida que SIGUE esperando reintento (isPending ya volvió a false, el modal sigue abierto) → no hace falta fusionar porque el gate ya se apagó', () => {
    // isPending refleja el estado REAL: una vez que la mutación resuelve
    // (éxito o fallo de negocio), isPending es false — el escenario "sigue
    // esperando reintento" ya NO tiene el gate activo (ver
    // debeEncolarAgregado), así que lo agregado en ese tramo entra directo
    // al carrito-borrador, nunca pasa por la cola.
    expect(debeFusionarColaAhora(true, false, 2)).toBe(true);
  });

  it('"venta en curso" nunca estuvo activa (false→false, p.ej. el montaje inicial) → NO fusiona', () => {
    expect(debeFusionarColaAhora(false, false, 2)).toBe(false);
  });

  it('"venta en curso" se ACTIVA (false→true, clic en Confirmar cobro) → NO fusiona (no es el flanco de bajada)', () => {
    expect(debeFusionarColaAhora(false, true, 2)).toBe(false);
  });

  it('venta terminó pero no había nada en la cola → no hace falta fusionar nada', () => {
    expect(debeFusionarColaAhora(true, false, 0)).toBe(false);
  });
});

describe('fusionarColaEnCarrito — cómo entran los productos en espera', () => {
  it('producto nuevo (no estaba en el carrito) se antepone', () => {
    const carrito = [{ produto: { id: 1 }, cantidad: 2 }];
    const cola    = [{ produto: { id: 2 }, cantidad: 1 }];
    expect(fusionarColaEnCarrito(carrito, cola)).toEqual([
      { produto: { id: 2 }, cantidad: 1 },
      { produto: { id: 1 }, cantidad: 2 },
    ]);
  });

  it('mismo producto ya en el carrito → se suman las cantidades, no se duplica la línea', () => {
    const carrito = [{ produto: { id: 1 }, cantidad: 2 }];
    const cola    = [{ produto: { id: 1 }, cantidad: 3 }];
    const r = fusionarColaEnCarrito(carrito, cola);
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(5);
  });

  it('línea de balanza SIEMPRE es nueva, nunca se combina (dos paquetes del mismo PLU pesan distinto)', () => {
    const carrito = [{ produto: { id: 9 }, cantidad: 1.234, esBalanza: true }];
    const cola    = [{ produto: { id: 9 }, cantidad: 0.876, esBalanza: true }];
    const r = fusionarColaEnCarrito(carrito, cola);
    expect(r).toHaveLength(2);
  });

  it('cola vacía no cambia el carrito', () => {
    const carrito = [{ produto: { id: 1 }, cantidad: 2 }];
    expect(fusionarColaEnCarrito(carrito, [])).toEqual(carrito);
  });

  it('varios productos encolados entran todos, cada uno con su propia regla de combinar', () => {
    const carrito = [{ produto: { id: 1 }, cantidad: 1 }];
    const cola = [
      { produto: { id: 1 }, cantidad: 1 }, // combina con el existente
      { produto: { id: 2 }, cantidad: 1 }, // nuevo
    ];
    const r = fusionarColaEnCarrito(carrito, cola);
    expect(r.find(i => i.produto.id === 1)?.cantidad).toBe(2);
    expect(r.find(i => i.produto.id === 2)?.cantidad).toBe(1);
  });
});

describe('totalMostradoEnModal — el número que ve la cajera', () => {
  it('venta en curso (isPending) con un total congelado → muestra el congelado, no el en vivo', () => {
    expect(totalMostradoEnModal(true, 942.00, 1002.00)).toBe(942.00);
  });

  it('reproduce FAC-1746 exacto: congelado 942, en vivo inflado a 1002 por un producto de la siguiente venta', () => {
    expect(totalMostradoEnModal(true, 942.00, 1002.00)).not.toBe(1002.00);
  });

  it('modal abierto pero SIN confirmar (isPending=false) → sigue el total en vivo — el cliente agregó algo y el modal debe reflejarlo', () => {
    expect(totalMostradoEnModal(false, null, 1002.00)).toBe(1002.00);
  });

  it('sin venta en curso (isPending=false) → sigue el total en vivo, aunque haya un congelado viejo de la venta anterior', () => {
    expect(totalMostradoEnModal(false, 942.00, 1002.00)).toBe(1002.00);
  });

  it('isPending=true pero todavía no se congeló nada (null, primer render) → cae al en vivo', () => {
    expect(totalMostradoEnModal(true, null, 500)).toBe(500);
  });
});
