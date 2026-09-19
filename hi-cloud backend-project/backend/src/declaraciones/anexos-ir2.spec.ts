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

describe('AnexosIR2Service.getAnexoB1() — FASE 4 Bloque C', () => {
  it('sin ninguna cuenta con B1, todo en cero y el ISR explícitamente excluido', async () => {
    const { svc } = makeService({});
    const r = await svc.getAnexoB1('2026-01-01', '2026-12-31');
    expect(r.resultados).toEqual({ utilidadBruta: 0, totalGastos: 0, utilidadNeta: 0, margenBruto: 0, margenNeto: 0 });
    expect(r.isr.incluido).toBe(false);
    expect(r.isr.motivo).toMatch(/renta imponible fiscal/i);
    expect((r.resultados as any).isrEstimado).toBeUndefined();
  });

  it('agrupa ingresos/costos/gastos y calcula utilidad bruta y neta solo con cuentas B1', async () => {
    const { svc } = makeService({
      "JOIN cuenta_anexo_ir2 ca ON": [
        { codigo: '4.1.1.01', nombre: 'Ventas de Bienes', tipo: 'ingreso', naturaleza: 'acreedora', casillaIR2: null, saldo: '100000' },
        { codigo: '5.1.1.01', nombre: 'Costo de Ventas', tipo: 'costo', naturaleza: 'deudora', casillaIR2: null, saldo: '40000' },
        { codigo: '6.1.1.01', nombre: 'Sueldos', tipo: 'gasto', naturaleza: 'deudora', casillaIR2: null, saldo: '20000' },
      ],
    });
    const r = await svc.getAnexoB1('2026-01-01', '2026-12-31');
    expect(r.ingresos.total).toBe(100000);
    expect(r.costos.total).toBe(40000);
    expect(r.gastos.total).toBe(20000);
    expect(r.resultados.utilidadBruta).toBe(60000);
    expect(r.resultados.utilidadNeta).toBe(40000);
  });

  it('una cuenta de resultados con saldo pero sin etiqueta B1 queda fuera de los totales y aparece en alertas', async () => {
    const { svc } = makeService({
      "JOIN cuenta_anexo_ir2 ca ON": [
        { codigo: '4.1.1.01', nombre: 'Ventas de Bienes', tipo: 'ingreso', naturaleza: 'acreedora', casillaIR2: null, saldo: '10000' },
      ],
      'NOT EXISTS': [
        { codigo: '4.9.9.99', nombre: 'Ingreso custom sin etiquetar', tipo: 'ingreso', saldo: '777' },
      ],
    });
    const r = await svc.getAnexoB1('2026-01-01', '2026-12-31');
    expect(r.ingresos.total).toBe(10000);
    expect(r.alertas.cuentasDeResultadosSinEtiquetaB1).toEqual([
      { codigo: '4.9.9.99', nombre: 'Ingreso custom sin etiquetar', tipo: 'ingreso', saldo: 777 },
    ]);
  });

  it('advierte con el monto afectado cuando hay ventas de productos sin historial de costo, sin quedar en silencio', async () => {
    const { svc } = makeService({
      "f.\"empresaId\" = $1": [
        { id: 1, folio: 'FAC-001', fecha: '2026-03-05', lineas: '2', monto: '1500' },
        { id: 2, folio: 'FAC-014', fecha: '2026-06-10', lineas: '1', monto: '300' },
      ],
    });
    const r = await svc.getAnexoB1('2026-01-01', '2026-12-31');
    expect(r.alertas.ventasSinHistorialCosto.cantidadFacturas).toBe(2);
    expect(r.alertas.ventasSinHistorialCosto.montoAfectado).toBe(1800);
    expect(r.alertas.ventasSinHistorialCosto.nota).toMatch(/subestimado/i);
    expect(r.alertas.ventasSinHistorialCosto.facturas).toHaveLength(2);
  });

  it('sin ventas afectadas, la nota lo dice explícitamente en vez de quedar vacía', async () => {
    const { svc } = makeService({});
    const r = await svc.getAnexoB1('2026-01-01', '2026-12-31');
    expect(r.alertas.ventasSinHistorialCosto.cantidadFacturas).toBe(0);
    expect(r.alertas.ventasSinHistorialCosto.nota).toMatch(/costo conocido/i);
  });
});

describe('AnexosIR2Service.getAnexoD() — FASE 4 Bloque D', () => {
  it('calcula el costo de venta como Inventario Inicial + Compras Totales − Inventario Final', async () => {
    const { svc } = makeService({
      "ca.\"anexoIR2\" = 'D' AND al.debe": [],
      "SUM(c.total)": [{ total: '50000' }], // misma marca para ambas queries de compras (total y con importación) — ver abajo
    });
    const r = await svc.getAnexoD(2026);
    // sin cuentas de inventario mockeadas (0 y 0), compras totales = 50000 (matchea ambas por la marca compartida)
    expect(r.inventarioInicial.total).toBe(0);
    expect(r.inventarioFinal.total).toBe(0);
    expect(r.compras.totalPeriodo).toBe(50000);
    expect(r.costoVentaCalculado.valor).toBe(0 + 50000 - 0);
    expect(r.costoVentaCalculado.formula).toMatch(/Inventario Inicial/);
  });

  it('inventario inicial usa el saldo al cierre del año anterior, no del propio ejercicio', async () => {
    const query = jest.fn((sql: string, params: any[]) => {
      if (sql.includes("ca.\"anexoIR2\" = 'D'")) {
        // El segundo parámetro es la fecha de corte — distingue inicial (cierre año anterior) de final (cierre del ejercicio)
        const fechaCorte = params[1];
        if (fechaCorte === '2025-12-31') return Promise.resolve([{ codigo: '1.1.3.01', nombre: 'Mercancías', casillaIR2: 'inv_mercancias', saldo: '10000' }]);
        if (fechaCorte === '2026-12-31') return Promise.resolve([{ codigo: '1.1.3.01', nombre: 'Mercancías', casillaIR2: 'inv_mercancias', saldo: '15000' }]);
      }
      return Promise.resolve([{ total: '0' }]);
    });
    const svc: any = Object.create(AnexosIR2Service.prototype);
    svc.dataSource = { query };
    svc.tenantSvc = { getEmpresaId: () => 7 };

    const r = await svc.getAnexoD(2026);
    expect(r.inventarioInicial.total).toBe(10000);
    expect(r.inventarioFinal.total).toBe(15000);
    expect(r.periodo).toEqual({ anio: 2026, desde: '2026-01-01', hasta: '2026-12-31' });
  });

  it('las 3 líneas de llenado manual (Compras Locales, Compras del Exterior, ITBIS Llevado al Costo) van en cero con su motivo', async () => {
    const { svc } = makeService({});
    const r = await svc.getAnexoD(2026);
    expect(r.lineasLlenadoManual).toHaveLength(3);
    expect(r.lineasLlenadoManual.map((l: any) => l.concepto)).toEqual(['Compras Locales', 'Compras del Exterior', 'ITBIS Llevado al Costo']);
    for (const l of r.lineasLlenadoManual) {
      expect(l.valor).toBe(0);
      expect(l.motivo).toBeTruthy();
    }
  });

  it('siempre advierte que el saldo de apertura de Inventario puede arrastrar el desvío previo al costeo', async () => {
    const { svc } = makeService({});
    const r = await svc.getAnexoD(2026);
    expect(r.advertencias.saldoAperturaInventario).toMatch(/ajústalo contra el inventario físico/i);
  });

  it('"compras con gasto de importación asociado" es un número aparte de "compras totales" — no se presenta como Compras del Exterior', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('EXISTS (SELECT 1 FROM gastos_importacion')) return Promise.resolve([{ total: '12000' }]);
      if (sql.includes('SUM(c.total)')) return Promise.resolve([{ total: '80000' }]);
      return Promise.resolve([]);
    });
    const svc: any = Object.create(AnexosIR2Service.prototype);
    svc.dataSource = { query };
    svc.tenantSvc = { getEmpresaId: () => 7 };

    const r = await svc.getAnexoD(2026);
    expect(r.compras.totalPeriodo).toBe(80000);
    expect(r.compras.conGastoImportacionAsociado).toBe(12000);
    expect(r.compras.procedencia).toMatch(/proxy/i);
  });
});
