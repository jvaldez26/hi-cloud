/**
 * validar606() — umbral de NCF obligatorio (2026-09-19).
 *
 * El mensaje decía "RD$50" y el código aplicaba 5000 — ninguno de los dos
 * coincidía con el otro, y ninguno citaba una norma real. Corregido a
 * RD$50,000 (la mejor evidencia encontrada, confirmada con el usuario;
 * ver el comentario en dgii-validator.service.ts).
 */

import { DgiiValidatorService } from './dgii-validator.service';
import type { Fila606 } from './dgii-validator.service';

function fila(overrides: Partial<Fila606>): Fila606 {
  return {
    linea: 1, id: 1, folio: 'F-1',
    rncProveedor: '101000000', ncfProveedor: 'B0100000001',
    montoFacturado: 1000, itbis: 180,
    ...overrides,
  } as Fila606;
}

describe('DgiiValidatorService.validar606() — umbral de NCF obligatorio', () => {
  const svc = new DgiiValidatorService();

  it('sin NCF, monto por debajo de RD$50,000: no exige NCF', () => {
    const r = svc.validar606([fila({ ncfProveedor: undefined, montoFacturado: 49999 })]);
    expect(r.errores.some(e => e.campo === 'NCF proveedor')).toBe(false);
  });

  it('sin NCF, monto por encima de RD$50,000: error con el mensaje correcto', () => {
    const r = svc.validar606([fila({ ncfProveedor: undefined, montoFacturado: 50001 })]);
    const err = r.errores.find(e => e.campo === 'NCF proveedor');
    expect(err?.mensaje).toBe('Compra mayor a RD$50,000 sin NCF del proveedor');
  });

  it('exactamente RD$50,000: no exige (el corte es ">", no ">=")', () => {
    const r = svc.validar606([fila({ ncfProveedor: undefined, montoFacturado: 50000 })]);
    expect(r.errores.some(e => e.campo === 'NCF proveedor')).toBe(false);
  });

  it('con NCF, sin importar el monto: nunca exige nada de este campo', () => {
    const r = svc.validar606([fila({ ncfProveedor: 'B0100000001', montoFacturado: 999999 })]);
    expect(r.errores.some(e => e.campo === 'NCF proveedor')).toBe(false);
  });
});
