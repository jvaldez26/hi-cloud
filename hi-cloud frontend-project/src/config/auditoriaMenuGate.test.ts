import { describe, it, expect } from 'vitest';
import { puedeVerAuditoria } from './auditoriaMenuGate';

describe('puedeVerAuditoria', () => {
  it('contador con el ajuste encendido: ve Auditoría', () => {
    expect(puedeVerAuditoria('contador', true)).toBe(true);
  });

  it('contador con el ajuste apagado: NO ve Auditoría', () => {
    expect(puedeVerAuditoria('contador', false)).toBe(false);
  });

  it('admin no se ve afectado por el ajuste — siempre true', () => {
    expect(puedeVerAuditoria('admin', false)).toBe(true);
    expect(puedeVerAuditoria('admin', true)).toBe(true);
  });

  it('super_admin no se ve afectado', () => {
    expect(puedeVerAuditoria('super_admin', false)).toBe(true);
  });

  it('cualquier otro rol tampoco lo decide este ajuste (rolPuedeVerRuta ya los bloquea aparte)', () => {
    expect(puedeVerAuditoria('vendedor', false)).toBe(true);
  });
});
