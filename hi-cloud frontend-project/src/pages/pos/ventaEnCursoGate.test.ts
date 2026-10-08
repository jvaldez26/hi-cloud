import { describe, it, expect } from 'vitest';
import { fusionarColaEnCarrito, debeFusionarColaAhora, totalMostradoEnModal } from './ventaEnCursoGate';

/**
 * Regresión FAC-1746 (empresa 73, 2026-10-08): un producto escaneado
 * mientras el modal de cobro estaba abierto (la emisión del e-CF puede
 * tardar varios segundos) se mezcló con el carrito que se estaba cobrando
 * — infló el total mostrado/impreso sin tocar la factura ya enviada.
 * Decisión (2026-10-08, ajuste sobre el fix anterior): en vez de rechazar
 * el escaneo, se encola para la próxima venta y entra solo cuando la venta
 * en curso termina de verdad.
 */

describe('debeFusionarColaAhora — solo en el flanco de bajada del modal de cobro', () => {
  it('venta terminó (modal pasa de abierto a cerrado) con cola pendiente → fusiona', () => {
    expect(debeFusionarColaAhora(/* antes */ true, /* ahora */ false, /* cola */ 2)).toBe(true);
  });

  it('venta fallida que SIGUE esperando reintento (modal se queda abierto) → NO fusiona', () => {
    // Este es el caso explícito del punto 2: _emisionFallo preserva el
    // carrito-borrador y el modal no se cierra — la cola no debe tocarlo.
    expect(debeFusionarColaAhora(true, true, 2)).toBe(false);
  });

  it('modal nunca estuvo abierto (false→false, p.ej. el montaje inicial) → NO fusiona', () => {
    expect(debeFusionarColaAhora(false, false, 2)).toBe(false);
  });

  it('modal se ABRE (false→true) → NO fusiona (no es el flanco de bajada)', () => {
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

  it('sin venta en curso (isPending=false) → sigue el total en vivo, aunque haya un congelado viejo', () => {
    expect(totalMostradoEnModal(false, 942.00, 1002.00)).toBe(1002.00);
  });

  it('isPending=true pero todavía no se congeló nada (null, primer render) → cae al en vivo', () => {
    expect(totalMostradoEnModal(true, null, 500)).toBe(500);
  });
});
