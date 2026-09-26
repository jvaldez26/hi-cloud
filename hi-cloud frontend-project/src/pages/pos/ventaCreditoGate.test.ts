import { describe, it, expect } from 'vitest';
import { requiereSupervisorVentaCredito } from './ventaCreditoGate';

describe('requiereSupervisorVentaCredito', () => {
  it('Contado nunca requiere supervisor, sin importar la configuración', () => {
    expect(requiereSupervisorVentaCredito({
      tipoPago: 'CONTADO', supervisorModeEnabled: true, posSupervisorVentaCredito: true,
    })).toBe(false);
  });

  it('Crédito con modo supervisor DESACTIVADO en la empresa: libre, como hoy', () => {
    expect(requiereSupervisorVentaCredito({
      tipoPago: 'CREDITO', supervisorModeEnabled: false, posSupervisorVentaCredito: true,
    })).toBe(false);
  });

  it('Crédito con modo supervisor activado, flag por acción sin tocar (undefined): protegido por defecto', () => {
    expect(requiereSupervisorVentaCredito({
      tipoPago: 'CREDITO', supervisorModeEnabled: true, posSupervisorVentaCredito: undefined,
    })).toBe(true);
  });

  it('Crédito con modo supervisor activado y flag por acción explícitamente desactivado: libre', () => {
    expect(requiereSupervisorVentaCredito({
      tipoPago: 'CREDITO', supervisorModeEnabled: true, posSupervisorVentaCredito: false,
    })).toBe(false);
  });

  it('Crédito con modo supervisor activado y flag por acción activado: requiere supervisor', () => {
    expect(requiereSupervisorVentaCredito({
      tipoPago: 'CREDITO', supervisorModeEnabled: true, posSupervisorVentaCredito: true,
    })).toBe(true);
  });
});
