import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regresión del bug de seguridad real (reporte de Bellamar González — VENTAS
 * DIVERSAS ELIDO): el listener global de Enter para "Confirmar cobro" tenía
 * su PROPIA copia de ventaMut.mutate() — un segundo camino de código que
 * nunca pasaba por requiereSupervisorVentaCredito / supervisor.requireSupervisor.
 * Presionar Enter mientras el modal de Autorización de Supervisor estaba
 * abierto creaba la factura en paralelo, sin esperar — con clave correcta o
 * incorrecta, daba igual.
 *
 * Una prueba de comportamiento (render completo de POSPage + simular teclas)
 * exigiría mockear la decena larga de llamadas a la API que dispara al
 * montar (config, servicios, clientes, caja, impresoras, cotizaciones,
 * pre-facturas...) — desproporcionado para lo que hay que probar, y frágil
 * (un mock incompleto hace que ni siquiera monte, sin decir nada del bug
 * real). En cambio, esto prueba el INVARIANTE ESTRUCTURAL que habría
 * atajado el bug real: tiene que existir UN SOLO lugar en todo el archivo
 * que llame a ventaMut.mutate(), y tiene que ser dentro de confirmarCobro()
 * — el único camino con todas las validaciones. Si alguien agrega mañana un
 * atajo nuevo (otra F-key, otro listener) que llame a ventaMut.mutate() por
 * su cuenta, este test lo atrapa antes de que llegue a producción — sin
 * importar qué tecla sea ni si el modal estaba abierto o cerrado cuando se
 * escribió el atajo nuevo.
 */
describe('POSPage — confirmarCobro() es el ÚNICO camino que confirma el cobro', () => {
  const ruta = path.resolve(__dirname, './POSPage.tsx');
  const fuente = fs.readFileSync(ruta, 'utf-8');

  it('ventaMut.mutate() se LLAMA (con el ";" de cierre, no solo mencionado en un comentario) exactamente UNA vez en todo el archivo', () => {
    const llamadasReales = fuente.match(/ventaMut\.mutate\(\);/g) ?? [];
    expect(llamadasReales).toHaveLength(1);
  });

  it('esa única llamada vive DENTRO de confirmarCobro(), con todas sus validaciones — no en un listener de teclado suelto', () => {
    const inicio = fuente.indexOf('const confirmarCobro = useCallback(async () => {');
    expect(inicio).toBeGreaterThan(-1);

    const marcaCierre = '\n  }, [canCheckout, ventaMut, tipoPagoPos, supervisor, posConf, totalEfectivo, cart, empresa]);';
    const cierre = fuente.indexOf(marcaCierre, inicio);
    expect(cierre).toBeGreaterThan(inicio);

    const cuerpo = fuente.slice(inicio, cierre);
    expect(cuerpo).toContain('ventaMut.mutate();');
    expect(cuerpo).toContain('requiereSupervisorVentaCredito(');
    expect(cuerpo).toContain('supervisor.requireSupervisor(');
    expect(cuerpo).toContain('requiereSupervisorPorPrecioModificado(');
  });

  it('NINGÚN listener de keydown del archivo (Enter, F-keys, scanner, ESC...) llama a ventaMut.mutate() directo', () => {
    const bloquesKeydown = [...fuente.matchAll(
      /const (?:handler|handleGlobalKeyDown) = \(e: KeyboardEvent\) => \{([\s\S]*?)\n {4}\};/g,
    )];
    // Si esto da 0, el patrón del código cambió de forma — que el test avise
    // en rojo, no que pase en falso por no encontrar nada que revisar.
    expect(bloquesKeydown.length).toBeGreaterThanOrEqual(3);

    for (const [, cuerpoHandler] of bloquesKeydown) {
      expect(cuerpoHandler).not.toContain('ventaMut.mutate(');
    }
  });

  it('el atajo de Enter del carrito delega en confirmarCobro() y se ignora si el evento viene de dentro de un modal (el bug real)', () => {
    const inicio = fuente.indexOf('// Enter / NumpadEnter confirma el cobro cuando el modal de pago está abierto');
    expect(inicio).toBeGreaterThan(-1);

    const cierre = fuente.indexOf('}, [showPago, confirmarCobro]);', inicio);
    expect(cierre).toBeGreaterThan(inicio);

    const bloque = fuente.slice(inicio, cierre);
    expect(bloque).toContain('confirmarCobro();');
    expect(bloque).toContain('debeIgnorarEnterGlobal(');
    expect(bloque).not.toContain('ventaMut.mutate(');
  });

  it('el botón "Confirmar cobro" también delega en confirmarCobro() — un solo camino para los dos disparadores', () => {
    expect(fuente).toMatch(/onClick=\{confirmarCobro\}/);
  });
});
