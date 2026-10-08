import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CLASE_MODAL_COBRO } from './confirmarCobroEnterGate';

/**
 * Regresión #1 — bug de seguridad real (reporte de Bellamar González —
 * VENTAS DIVERSAS ELIDO): el listener global de Enter para "Confirmar
 * cobro" tenía su PROPIA copia de ventaMut.mutate() — un segundo camino de
 * código que nunca pasaba por el gate de 'venta_credito' /
 * supervisor.requireSupervisor. Presionar Enter mientras el modal de
 * Autorización de Supervisor estaba abierto creaba la factura en paralelo,
 * sin esperar — con clave correcta o incorrecta, daba igual.
 *
 * Regresión #2 — el fix de la #1 (ignorar Enter dentro de CUALQUIER
 * `.ant-modal`) rompió el cobro para TODAS las cajas la misma noche: la
 * propia pantalla de cobro ES un `.ant-modal`. El fix real distingue el
 * modal de cobro (CLASE_MODAL_COBRO) de cualquier OTRO modal apilado
 * encima — ver confirmarCobroEnterGate.ts para el comportamiento exacto.
 *
 * Una prueba de comportamiento (render completo de POSPage + simular teclas)
 * exigiría mockear la decena larga de llamadas a la API que dispara al
 * montar (config, servicios, clientes, caja, impresoras, cotizaciones,
 * pre-facturas...) — desproporcionado para lo que hay que probar, y frágil
 * (un mock incompleto hace que ni siquiera monte, sin decir nada del bug
 * real). En cambio, esto prueba el INVARIANTE ESTRUCTURAL que habría
 * atajado ambos bugs reales: tiene que existir UN SOLO lugar en todo el
 * archivo que llame a ventaMut.mutate(), tiene que ser dentro de
 * confirmarCobro(), el atajo de Enter tiene que delegar en
 * debeIgnorarEnterGlobal() (probado aparte, por comportamiento, en
 * confirmarCobroEnterGate.test.ts), y el modal de cobro tiene que llevar la
 * MISMA clase que ese gate reconoce como "sí cobra aquí".
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

    const marcaCierre = '\n  }, [canCheckout, ventaMut, tipoPagoPos, supervisor, posConf, totalEfectivo, totalAPagar, cart, empresa]);';
    const cierre = fuente.indexOf(marcaCierre, inicio);
    expect(cierre).toBeGreaterThan(inicio);

    const cuerpo = fuente.slice(inicio, cierre);
    expect(cuerpo).toContain('ventaMut.mutate();');
    // El gate de venta a crédito ya no pasa por un helper aparte
    // (requiereSupervisorVentaCredito) — la política 'venta_credito' del
    // catálogo de Modo Supervisor decide internamente si hace falta algo.
    expect(cuerpo).toContain("tipoPagoPos === 'CREDITO'");
    expect(cuerpo).toContain("supervisor.requireSupervisor('venta_credito'");
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

  it('el atajo de Enter del carrito existe y delega SIEMPRE en confirmarCobro() — nunca llama a ventaMut.mutate() por su cuenta', () => {
    const inicio = fuente.indexOf('// Enter / NumpadEnter confirma el cobro cuando el modal de pago está abierto');
    expect(inicio).toBeGreaterThan(-1);

    const cierre = fuente.indexOf('}, [showPago, confirmarCobro]);', inicio);
    expect(cierre).toBeGreaterThan(inicio);

    const bloque = fuente.slice(inicio, cierre);
    expect(bloque).toContain('confirmarCobro();');
    expect(bloque).toContain('debeIgnorarEnterGlobal(');
    expect(bloque).not.toContain('ventaMut.mutate(');
  });

  it('confirmarCobroEnterGate.ts (el gate probado por comportamiento) está importado — el listener no reimplementa su propia lógica de "¿qué modal es este?"', () => {
    expect(fuente).toMatch(/import \{ debeIgnorarEnterGlobal \} from '\.\/confirmarCobroEnterGate';/);
  });

  it('el modal de cobro lleva CLASE_MODAL_COBRO — la regresión #2 real: sin esto, Enter queda ignorado también DENTRO de la pantalla de cobro', () => {
    const inicioModal = fuente.indexOf('{/* ── Payment modal');
    expect(inicioModal).toBeGreaterThan(-1);
    // La etiqueta <Modal ...> de la pantalla de cobro, no cualquier otro <Modal> del archivo.
    const bloqueModal = fuente.slice(inicioModal, inicioModal + 600);
    expect(bloqueModal).toContain(`className="${CLASE_MODAL_COBRO}"`);
  });

  it('el botón "Confirmar cobro" también delega en confirmarCobro() — un solo camino para los dos disparadores', () => {
    expect(fuente).toMatch(/onClick=\{confirmarCobro\}/);
  });
});

/**
 * Regresión real (reporte del usuario, 2026-10-05): el handler de cambio de
 * panel de la barra inferior tenía su propio mapa clave-por-panel escrito a
 * mano (CLAVE_POR_PANEL) que solo cubría 5 de las 15 pestañas — Cotizaciones
 * y Conduce (entre otras) quedaban navegables sin pedir autorización de
 * supervisor aunque el admin las marcara como requeridas en Configuración.
 * El fix: el handler usa CLAVE_SUPERVISOR_POR_PANEL, importado desde
 * posPanelesConfig.ts (fuente única, cubre las 15 — ver
 * posPanelesConfig.test.ts para la prueba de cobertura completa). Este test
 * solo exige que el handler no vuelva a traer su propia copia parcial.
 */
describe('POSPage — onPanelChange gatea TODAS las pestañas, no una lista parcial recableada a mano', () => {
  const ruta = path.resolve(__dirname, './POSPage.tsx');
  const fuente = fs.readFileSync(ruta, 'utf-8');

  it('importa CLAVE_SUPERVISOR_POR_PANEL desde posPanelesConfig (no define su propio mapa local)', () => {
    expect(fuente).toMatch(/import \{[^}]*CLAVE_SUPERVISOR_POR_PANEL[^}]*\} from '\.\.\/\.\.\/config\/posPanelesConfig';/);
    expect(fuente).not.toMatch(/const CLAVE_POR_PANEL/);
  });

  it('onPanelChange consulta CLAVE_SUPERVISOR_POR_PANEL para resolver la clave del panel', () => {
    const inicio = fuente.indexOf('onPanelChange={async (p) => {');
    expect(inicio).toBeGreaterThan(-1);
    const cierre = fuente.indexOf('onNavigate={(ruta) => {', inicio);
    expect(cierre).toBeGreaterThan(inicio);
    const cuerpo = fuente.slice(inicio, cierre);
    expect(cuerpo).toContain('CLAVE_SUPERVISOR_POR_PANEL[p]');
  });
});
