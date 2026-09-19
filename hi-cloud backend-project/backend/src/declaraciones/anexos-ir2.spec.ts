/**
 * FASE 4 Bloque B — Anexo A1 (Balance General) del IR-2.
 *
 * Verifica: (1) se arma solo desde cuentas etiquetadas con A1, agrupadas
 * corriente/no-corriente por prefijo de código igual que el Balance
 * General de Reportes Financieros; (2) las líneas que el ERP no puede
 * llenar (revaluación, dividendos a cuenta, aportes a capitalizar) van en
 * cero y marcadas llenadoManual — nunca se inventa un valor; (3) una
 * cuenta de balance con saldo pero sin etiqueta A1 se reporta como alerta,
 * no se le fuerza una etiqueta ni se cuela en el total en silencio.
 */

import { AnexosIR2Service } from './anexos-ir2.service';

function makeService(responses: Record<string, any[]>) {
  const query = jest.fn((sql: string) => {
    for (const [marca, rows] of Object.entries(responses)) {
      if (sql.includes(marca)) return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  });
  const svc: any = Object.create(AnexosIR2Service.prototype);
  svc.dataSource = { query };
  svc.tenantSvc = { getEmpresaId: () => 7 };
  return { svc: svc as AnexosIR2Service, query };
}

describe('AnexosIR2Service.getAnexoA1()', () => {
  it('sin ninguna cuenta con A1, devuelve todo en cero pero con las 3 líneas de llenado manual', async () => {
    const { svc } = makeService({});
    const r = await svc.getAnexoA1('2026-12-31');
    expect(r.totales).toEqual({ activos: 0, pasivosPatrimonio: 0, ecuacion: 0, cuadrado: true });
    expect(r.lineasLlenadoManual).toHaveLength(3);
    expect(r.lineasLlenadoManual.every((l: any) => l.llenadoManual === true && l.valor === 0)).toBe(true);
  });

  it('agrupa activo corriente (1.1) y no corriente (1.2) por prefijo de código, igual que el Balance General', async () => {
    const { svc } = makeService({
      "JOIN cuenta_anexo_ir2 ca ON": [
        { codigo: '1.1.1.02', nombre: 'Caja General', tipo: 'activo', naturaleza: 'deudora', casillaIR2: null, saldo: '50000' },
        { codigo: '1.2.1.01', nombre: 'Muebles y Enseres', tipo: 'activo', naturaleza: 'deudora', casillaIR2: null, saldo: '30000' },
      ],
    });
    const r = await svc.getAnexoA1('2026-12-31');
    expect(r.activo.corriente.cuentas.map((c: any) => c.codigo)).toEqual(['1.1.1.02']);
    expect(r.activo.noCorriente.cuentas.map((c: any) => c.codigo)).toEqual(['1.2.1.01']);
    expect(r.activo.corriente.total).toBe(50000);
    expect(r.activo.noCorriente.total).toBe(30000);
    expect(r.activo.total).toBe(80000);
  });

  it('agrupa pasivo corriente (2.1) y no corriente (2.2), y patrimonio sin subdividir', async () => {
    const { svc } = makeService({
      "JOIN cuenta_anexo_ir2 ca ON": [
        { codigo: '2.1.1.01', nombre: 'Proveedores', tipo: 'pasivo', naturaleza: 'acreedora', casillaIR2: null, saldo: '20000' },
        { codigo: '2.2.1.01', nombre: 'Préstamos Bancarios LP', tipo: 'pasivo', naturaleza: 'acreedora', casillaIR2: null, saldo: '15000' },
        { codigo: '3.1.1.01', nombre: 'Capital Suscrito y Pagado', tipo: 'patrimonio', naturaleza: 'acreedora', casillaIR2: null, saldo: '45000' },
      ],
    });
    const r = await svc.getAnexoA1('2026-12-31');
    expect(r.pasivo.corriente.total).toBe(20000);
    expect(r.pasivo.noCorriente.total).toBe(15000);
    expect(r.pasivo.total).toBe(35000);
    expect(r.patrimonio.total).toBe(45000);
  });

  it('la ecuación contable cuadra cuando activo = pasivo + patrimonio', async () => {
    const { svc } = makeService({
      "JOIN cuenta_anexo_ir2 ca ON": [
        { codigo: '1.1.1.02', nombre: 'Caja', tipo: 'activo', naturaleza: 'deudora', casillaIR2: null, saldo: '100000' },
        { codigo: '2.1.1.01', nombre: 'Proveedores', tipo: 'pasivo', naturaleza: 'acreedora', casillaIR2: null, saldo: '40000' },
        { codigo: '3.1.1.01', nombre: 'Capital', tipo: 'patrimonio', naturaleza: 'acreedora', casillaIR2: null, saldo: '60000' },
      ],
    });
    const r = await svc.getAnexoA1('2026-12-31');
    expect(r.totales.ecuacion).toBe(0);
    expect(r.totales.cuadrado).toBe(true);
  });

  it('una cuenta de balance con saldo pero sin etiqueta A1 aparece en alertas y NO en los totales del anexo', async () => {
    const { svc } = makeService({
      "JOIN cuenta_anexo_ir2 ca ON": [
        { codigo: '1.1.1.02', nombre: 'Caja', tipo: 'activo', naturaleza: 'deudora', casillaIR2: null, saldo: '10000' },
      ],
      'NOT EXISTS': [
        { codigo: '1.9.9.99', nombre: 'Cuenta custom sin etiquetar', tipo: 'activo', saldo: '500' },
      ],
    });
    const r = await svc.getAnexoA1('2026-12-31');
    expect(r.activo.total).toBe(10000); // no incluye los 500 de la cuenta sin etiquetar
    expect(r.alertas.cuentasDeBalanceSinEtiquetaA1).toEqual([
      { codigo: '1.9.9.99', nombre: 'Cuenta custom sin etiquetar', tipo: 'activo', saldo: 500 },
    ]);
  });

  it('cada línea de llenado manual trae su motivo y ninguna inventa un valor distinto de 0', async () => {
    const { svc } = makeService({});
    const r = await svc.getAnexoA1('2026-12-31');
    const conceptos = r.lineasLlenadoManual.map((l: any) => l.concepto);
    expect(conceptos).toEqual(['Revaluación de activos', 'Dividendos a cuenta', 'Aportes para futura capitalización']);
    for (const l of r.lineasLlenadoManual) {
      expect(l.motivo).toBeTruthy();
      expect(l.valor).toBe(0);
    }
  });

  it('la casillaIR2 de cada cuenta se expone tal cual (texto libre, puede venir null)', async () => {
    const { svc } = makeService({
      "JOIN cuenta_anexo_ir2 ca ON": [
        { codigo: '1.1.1.02', nombre: 'Caja', tipo: 'activo', naturaleza: 'deudora', casillaIR2: '6.1', saldo: '1000' },
      ],
    });
    const r = await svc.getAnexoA1('2026-12-31');
    expect(r.activo.corriente.cuentas[0].casillaIR2).toBe('6.1');
  });
});
