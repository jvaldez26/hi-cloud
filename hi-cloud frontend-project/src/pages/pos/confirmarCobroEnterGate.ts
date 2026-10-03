/**
 * ¿El atajo de teclado Enter que confirma el cobro (POSPage) debe IGNORAR
 * este evento? Mismo patrón que ventaCreditoGate.ts / carritoRecuperadoGate.ts.
 *
 * Hotfix de seguridad (reporte de Bellamar González — VENTAS DIVERSAS
 * ELIDO): el listener global de Enter para "Confirmar cobro" no distinguía
 * si el Enter venía del campo de PIN del modal de Autorización de
 * Supervisor — ese mismo keydown burbujea hasta `window` y antes disparaba
 * la venta en paralelo a la verificación del PIN, sin esperar su resultado.
 * Una venta a crédito podía crearse sin autorización con solo presionar
 * Enter, con clave correcta o incorrecta.
 *
 * Mismo criterio ya probado en este archivo para el listener del scanner de
 * código de barras (handleGlobalKeyDown, POSPage.tsx): ignorar cualquier
 * evento que venga de dentro de un `.ant-modal` — cubre todo modal presente
 * y futuro sin tener que enumerar un flag de estado por cada uno.
 */
export function debeIgnorarEnterGlobal(target: Pick<HTMLElement, 'tagName' | 'closest'> | null): boolean {
  if (!target) return false;
  if (target.tagName === 'TEXTAREA') return true;
  return !!target.closest('.ant-modal');
}
