/**
 * ¿Esta venta necesita autorización de supervisor antes de confirmar el
 * cobro? Mismo patrón que Gastos / Cierre de Caja (ver ConfiguracionPage.tsx
 * y POSPage.tsx): flag global (modo supervisor de la empresa) + flag por
 * acción, protegido POR DEFECTO (`posSupervisorVentaCredito !== false` — si
 * la empresa nunca tocó el toggle, la acción queda protegida igual que
 * Gastos/Cierre de Caja, no libre).
 *
 * Contado nunca pasa por aquí — la protección es exclusiva de Crédito.
 */
export function requiereSupervisorVentaCredito(params: {
  tipoPago: 'CONTADO' | 'CREDITO';
  supervisorModeEnabled: boolean;
  posSupervisorVentaCredito?: unknown;
}): boolean {
  return params.tipoPago === 'CREDITO'
    && params.supervisorModeEnabled
    && params.posSupervisorVentaCredito !== false;
}
