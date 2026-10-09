import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  fusionarColaEnCarrito, debeFusionarColaAhora, totalMostradoEnModal, debeEncolarAgregado,
} from './ventaEnCursoGate';

/**
 * Regresión FAC-1746 (empresa 73, 2026-10-08): un producto escaneado
 * mientras la venta se emitía se mezcló con el carrito que se estaba
 * cobrando — infló el total mostrado/impreso sin tocar la factura ya
 * enviada.
 *
 * Primer ajuste (commit 6d5ca099): en vez de rechazar el escaneo, se
 * encola para la próxima venta y entra solo cuando la venta en curso
 * termina de verdad.
 *
 * Segundo ajuste (commit 55100654): el gate arrancaba con showPago (modal
 * de cobro abierto) en vez de con "venta en curso" — un producto agregado
 * ANTES de confirmar debe entrar a la venta actual, no a la cola.
 *
 * Tercer ajuste (este): dos huecos de la revisión de 55100654 —
 *   1. ventaEnCursoRef se sincronizaba solo en el cuerpo del render — entre
 *      el clic en "Confirmar cobro" y el siguiente render, un scan aún
 *      entraba al carrito que se estaba facturando. Se fija AHORA de forma
 *      sincrónica, dentro de confirmarCobro(), justo antes de mutate().
 *   2. La fusión de la cola se disparaba con ventaMut.isPending true→false,
 *      que TAMBIÉN ocurre cuando la mutación falla y el carrito se
 *      conserva para reintentar — eso mezclaría la cola con un borrador a
 *      punto de reenviarse. La señal correcta es que el CARRITO SE VACÍE
 *      (éxito, o la cajera abandona el intento) — un fallo de negocio no
 *      vacía el carrito, así que ya no dispara la fusión.
 */

describe('debeEncolarAgregado — el gate es "venta en curso" (isPending), nunca "modal abierto"', () => {
  it('modal de cobro abierto pero SIN confirmar todavía → no encola, entra a la venta actual', () => {
    expect(debeEncolarAgregado(/* ventaEnCurso */ false)).toBe(false);
  });

  it('venta en curso (tras el clic en "Confirmar cobro", esperando la respuesta del servidor) → encola', () => {
    expect(debeEncolarAgregado(true)).toBe(true);
  });
});

describe('POSPage.tsx — el gate se activa SINCRÓNICAMENTE en confirmarCobro(), antes de mutate()', () => {
  // Verificación estructural (no de comportamiento): un scanner no espera a
  // React. Si ventaEnCursoRef.current solo se pusiera en true por la
  // sincronización del cuerpo del render (`ventaEnCursoRef.current =
  // ventaMut.isPending`), un scan que llega en el instante entre el clic y
  // el siguiente render todavía vería la ref en false. La única forma
  // robusta de cerrar esa ventana es fijarla ANTES de llamar mutate(),
  // dentro del mismo handler síncrono del clic — así que se prueba que el
  // código realmente lo hace ahí, en ese orden.
  const fuente = fs.readFileSync(path.resolve(__dirname, './POSPage.tsx'), 'utf-8');

  it('confirmarCobro() fija ventaEnCursoRef.current = true ANTES de ventaMut.mutate()', () => {
    const inicio = fuente.indexOf('const confirmarCobro = useCallback(async () => {');
    expect(inicio).toBeGreaterThan(-1);
    const cierre = fuente.indexOf('ventaMut.mutate();', inicio);
    expect(cierre).toBeGreaterThan(inicio);

    const cuerpo = fuente.slice(inicio, cierre);
    expect(cuerpo).toContain('ventaEnCursoRef.current = true;');
  });
});

describe('debeFusionarColaAhora — dispara cuando el carrito se VACÍA, nunca con un fallo que lo conserva', () => {
  it('venta terminó con éxito (carrito tenía productos, ahora está vacío) con cola pendiente → fusiona', () => {
    expect(debeFusionarColaAhora(/* tenía algo */ true, /* tiene algo ahora */ false, /* cola */ 2)).toBe(true);
  });

  it('emisión fallida: el carrito se CONSERVA para reintentar (sigue teniendo lo mismo) → la cola NO lo toca', () => {
    // Este es el caso explícito del ajuste: _emisionFallo/_requiereSupervisor/
    // onError dejan el carrito intacto — "tenía algo" y "tiene algo ahora"
    // son ambos true, no hay vaciado, así que no se fusiona.
    expect(debeFusionarColaAhora(true, true, 2)).toBe(false);
  });

  it('reintento exitoso (el carrito por fin se vacía en el segundo intento) → ahí SÍ se fusiona', () => {
    // Simula la secuencia completa: 1er intento falla (true,true → no
    // fusiona, la cola sigue esperando), 2do intento tiene éxito
    // (true,false → fusiona todo lo acumulado).
    expect(debeFusionarColaAhora(true, true, 3)).toBe(false);
    expect(debeFusionarColaAhora(true, false, 3)).toBe(true);
  });

  it('el carrito nunca tuvo nada (false→false, p.ej. el montaje inicial) → NO fusiona', () => {
    expect(debeFusionarColaAhora(false, false, 2)).toBe(false);
  });

  it('el carrito EMPIEZA a tener algo (false→true, se agregó el primer producto) → NO fusiona (no es vaciado)', () => {
    expect(debeFusionarColaAhora(false, true, 2)).toBe(false);
  });

  it('el carrito se vació pero no había nada en la cola → no hace falta fusionar nada', () => {
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
