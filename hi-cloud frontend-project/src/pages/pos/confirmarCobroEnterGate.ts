/** Clase marcadora del modal de cobro (ver <Modal className="hc-modal-cobro"> en
 *  POSPage.tsx) — Enter SÍ debe cobrar dentro de este modal, nunca dentro de
 *  cualquier otro (supervisor, cliente, etc.) apilado encima. */
export const CLASE_MODAL_COBRO = 'hc-modal-cobro';

/**
 * ¿El atajo de teclado Enter que confirma el cobro (POSPage) debe IGNORAR
 * este evento? Mismo patrón que carritoRecuperadoGate.ts.
 *
 * Hotfix de seguridad #1 (reporte de Bellamar González — VENTAS DIVERSAS
 * ELIDO): el listener global de Enter para "Confirmar cobro" no distinguía
 * si el Enter venía del campo de PIN del modal de Autorización de
 * Supervisor — ese mismo keydown burbujea hasta `window` y antes disparaba
 * la venta en paralelo a la verificación del PIN, sin esperar su resultado.
 * Una venta a crédito podía crearse sin autorización con solo presionar
 * Enter, con clave correcta o incorrecta.
 *
 * Regresión #2 (reporte en producción, misma noche): el fix de arriba
 * ignoraba Enter dentro de CUALQUIER `.ant-modal` — pero la propia pantalla
 * de cobro ES un `.ant-modal` (antd la monta así), así que Enter dejó de
 * cobrar para TODAS las cajas. La pantalla de cobro necesita un
 * identificador explícito (CLASE_MODAL_COBRO) para diferenciarse de
 * cualquier OTRO modal apilado encima (supervisor, cliente...): Enter se
 * ignora solo si hay un `.ant-modal` de por medio que NO sea el de cobro.
 */
export function debeIgnorarEnterGlobal(target: Pick<HTMLElement, 'tagName' | 'closest'> | null): boolean {
  if (!target) return false;
  if (target.tagName === 'TEXTAREA') return true;
  const modal = target.closest('.ant-modal');
  if (!modal) return false; // no hay ningún modal de por medio (buscador del carrito, etc.)
  return !modal.classList.contains(CLASE_MODAL_COBRO);
}
