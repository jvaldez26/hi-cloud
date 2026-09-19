/**
 * FASE 3 — conciliación fiscal 606 vs IR-2. Verifica:
 *  1. Las 11 filas (una por código 606) siempre están presentes, incluso sin datos.
 *  2. El total 606 y el total IR-2 vienen de fuentes distintas y se separan por
 *     requiereNCF (con NCF vs sin NCF — nómina/TSS/depreciación nunca al 606).
 *  3. Las 4 alertas preventivas y el Anexo J se arman a partir de queries independientes.
 *  4. La tabla de correspondencias confirmadas/conceptuales se expone tal cual.
 *
 * El DataSource se mockea despachando por subcadena del SQL — cada query del
 * servicio tiene una marca única, así el mock no depende del orden de llamada
 * (Promise.all no garantiza orden estable entre awaits intermedios).
 */

import { ConciliacionFiscalService } from './conciliacion-fiscal.service';

function makeService(responses: Record<string, any[]>) {
  const query = jest.fn((sql: string) => {
    for (const [marca, rows] of Object.entries(responses)) {
      if (sql.includes(marca)) return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  });
  const svc: any = Object.create(ConciliacionFiscalService.prototype);
  svc.dataSource = { query };
  svc.tenantSvc = { getEmpresaId: () => 7 };
  return { svc: svc as ConciliacionFiscalService, query };
}

const VACIO = {
  'GROUP BY "tipoBienes"':                [],
  '"tipoGasto606" AS codigo':             [],
  'FROM reportes_dgii':                   [],
  'p.nombre':                             [],
  "FROM gastos g\n      WHERE":           [],
  'cc.naturaleza':                        [],
  'SUBSTRING(c."numeroFacturaProveedor"': [],
};

describe('ConciliacionFiscalService.getConciliacion606IR2()', () => {
  it('siempre devuelve las 11 filas de TIPOS_BIENES_606, aun sin ningún dato', async () => {
    const { svc } = makeService(VACIO);
    const r = await svc.getConciliacion606IR2(2026);
    expect(r.filasPorTipo).toHaveLength(11);
    expect(r.filasPorTipo.map((f: any) => f.codigo606)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'],
    );
    expect(r.totales).toEqual({ total606: 0, totalIR2ConNCF: 0, totalIR2SinNCF: 0, diferencia: 0 });
  });

  it('expone la tabla de correspondencias con el marcador confirmada/conceptual exacto del instructivo', async () => {
    const { svc } = makeService(VACIO);
    const r = await svc.getConciliacion606IR2(2026);
    const confirmadas = r.correspondencias.filter((c: any) => c.confirmada).map((c: any) => c.codigo606).sort();
    const conceptuales = r.correspondencias.filter((c: any) => !c.confirmada).map((c: any) => c.codigo606).sort();
    expect(confirmadas).toEqual(['02', '05', '06', '07', '08', '09']);
    expect(conceptuales).toEqual(['01', '03', '04', '10', '11']);
  });

  it('código 02 confirmada apunta a casilla 7 del Anexo B-1, con la nota de la colisión de nombre', () => {
    const svc: any = Object.create(ConciliacionFiscalService.prototype);
    const { CORRESPONDENCIA_606_IR2 } = require('./dgii.constants');
    const c02 = CORRESPONDENCIA_606_IR2.find((c: any) => c.codigo606 === '02');
    expect(c02.casillaIR2).toBe('7');
    expect(c02.anexoIR2).toBe('B1');
    expect(c02.nota).toMatch(/colisión|Renta Neta Imponible/i);
  });

  it('separa el total IR-2 con NCF del total sin NCF, y calcula la diferencia solo contra el "con NCF"', async () => {
    const { svc } = makeService({
      ...VACIO,
      'GROUP BY "tipoBienes"': [{ codigo: '01', total: '50000', cantidad: '3' }],
      '"tipoGasto606" AS codigo': [
        { codigo: '01', requiereNCF: true,  total: '20000' }, // gasto de personal con NCF (ej. consultoría)
        { codigo: '01', requiereNCF: false, total: '300000' }, // nómina — nunca va al 606
      ],
    });
    const r = await svc.getConciliacion606IR2(2026);
    const fila01 = r.filasPorTipo.find((f: any) => f.codigo606 === '01');
    expect(fila01.total606.valor).toBe(50000);
    expect(fila01.totalIR2ConNCF.valor).toBe(20000);
    expect(fila01.totalIR2SinNCF.valor).toBe(300000);
    expect(fila01.diferencia).toBe(20000 - 50000);
  });

  it('cada número trae su procedencia — nunca queda ambiguo de dónde salió', async () => {
    const { svc } = makeService(VACIO);
    const r = await svc.getConciliacion606IR2(2026);
    const fila = r.filasPorTipo[0];
    expect(fila.total606.procedencia).toMatch(/compras y gastos/);
    expect(fila.totalIR2ConNCF.procedencia).toMatch(/asientos contabilizados/);
    expect(fila.totalIR2SinNCF.procedencia).toMatch(/nunca puede aparecer en el 606/);
  });

  it('mesesSinTxtGenerado devuelve los 12 meses cuando nunca se generó ningún TXT 606 ese año', async () => {
    const { svc } = makeService(VACIO);
    const r = await svc.getConciliacion606IR2(2026);
    expect(r.alertas.mesesSinTxtGenerado).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  it('mesesSinTxtGenerado excluye los meses que sí tienen un ReporteDgii de tipo 606', async () => {
    const { svc } = makeService({ ...VACIO, 'FROM reportes_dgii': [{ mes: 3 }, { mes: 7 }] });
    const r = await svc.getConciliacion606IR2(2026);
    expect(r.alertas.mesesSinTxtGenerado).not.toContain(3);
    expect(r.alertas.mesesSinTxtGenerado).not.toContain(7);
    expect(r.alertas.mesesSinTxtGenerado).toHaveLength(10);
  });

  it('comprasSinRevisar pasa tal cual las compras con tipoBienes/formaPago en NULL', async () => {
    const { svc } = makeService({
      ...VACIO,
      'p.nombre': [{ id: 1, folio: 'OC-001', fecha: '2026-03-01', total: '1500', proveedor: 'ACME SRL' }],
    });
    const r = await svc.getConciliacion606IR2(2026);
    expect(r.alertas.comprasSinRevisar).toEqual([
      { id: 1, folio: 'OC-001', fecha: '2026-03-01', total: 1500, proveedor: 'ACME SRL' },
    ]);
  });

  it('gastosSinComprobante solo incluye los que caen en una cuenta con requiereNCF=true', async () => {
    const query = jest.fn((sql: string, params: any[]) => {
      if (sql.includes("FROM gastos g\n      WHERE")) {
        return Promise.resolve([
          { id: 1, descripcion: 'Alquiler marzo', categoria: 'alquiler', fecha: '2026-03-05', total: '30000' },
          { id: 2, descripcion: 'Nómina marzo',   categoria: 'nomina',   fecha: '2026-03-05', total: '150000' },
        ]);
      }
      if (sql.includes('codigo = ANY')) {
        // alquiler → 6.1.2.01 (requiereNCF true); nomina → 6.1.1.01 (requiereNCF false)
        return Promise.resolve([
          { codigo: '6.1.2.01', requiereNCF: true },
          { codigo: '6.1.1.01', requiereNCF: false },
        ]);
      }
      for (const [marca, rows] of Object.entries(VACIO)) if (sql.includes(marca)) return Promise.resolve(rows);
      return Promise.resolve([]);
    });
    const svc: any = Object.create(ConciliacionFiscalService.prototype);
    svc.dataSource = { query };
    svc.tenantSvc = { getEmpresaId: () => 7 };

    const r = await svc.getConciliacion606IR2(2026);
    expect(r.alertas.gastosSinComprobante).toHaveLength(1);
    expect(r.alertas.gastosSinComprobante[0].descripcion).toBe('Alquiler marzo');
  });

  it('cuentasSinEtiquetaConSaldo y anexoJ se exponen tal cual las devuelve la consulta', async () => {
    const { svc } = makeService({
      ...VACIO,
      'cc.naturaleza': [{ codigo: '6.9.9.99', nombre: 'Cuenta huérfana', tipo: 'gasto', saldo: '4200' }],
      'SUBSTRING(c."numeroFacturaProveedor"': [{ tipo: 'B01', cantidad: '5', monto: '80000' }],
    });
    const r = await svc.getConciliacion606IR2(2026);
    expect(r.alertas.cuentasSinEtiquetaConSaldo).toEqual([
      { codigo: '6.9.9.99', nombre: 'Cuenta huérfana', tipo: 'gasto', saldo: 4200 },
    ]);
    expect(r.anexoJ).toEqual([{ tipoComprobante: 'B01', cantidad: 5, monto: 80000 }]);
  });

  // FASE 4 Bloque A — anexoIR2 dejó de ser una columna de cuentas_contables
  // (pasó a la relación cuenta_anexo_ir2, ver cuenta-anexo-ir2.entity.ts).
  // Regresión pedida explícitamente: la conciliación de Fase 3 debe seguir
  // funcionando igual, ahora consultando la tabla nueva.
  it('regresión Bloque A: cuentasSinEtiquetaConSaldo consulta cuenta_anexo_ir2 (NOT EXISTS), no la columna vieja cc."anexoIR2"', async () => {
    const { svc, query } = makeService(VACIO);
    await svc.getConciliacion606IR2(2026);
    const sqlDeLaAlerta = query.mock.calls.map((c: any[]) => c[0]).find((sql: string) => sql.includes('cc.naturaleza'));
    expect(sqlDeLaAlerta).toBeDefined();
    expect(sqlDeLaAlerta).toMatch(/NOT EXISTS[\s\S]*cuenta_anexo_ir2/);
    expect(sqlDeLaAlerta).not.toMatch(/cc\."anexoIR2"/);
  });
});
