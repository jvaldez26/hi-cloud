import { AlertasSistemaService } from './alertas-sistema.service';

/**
 * Rediseño de la campanita (2026-10): stock bajo ahora exige ventas
 * recientes (no solo stockMinimo > stock — ver diagnóstico de los 8660
 * productos con stockMinimo 1-5 de importaciones CSV, no de un mínimo real),
 * y las rutas de los avisos llevan el filtro directo a la pantalla
 * correspondiente en vez de solo el módulo genérico.
 */
function buildService(resultados: Record<string, any[]>) {
  const query = jest.fn(async (sql: string, _params: any[]) => {
    for (const [patron, filas] of Object.entries(resultados)) {
      if (sql.includes(patron)) return filas;
    }
    return [];
  });
  const ds = { query };
  const tenantSvc = { getEmpresaId: () => 7 };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) };
  const svc = new AlertasSistemaService(ds as any, tenantSvc as any, cache as any);
  return { svc, query };
}

describe('AlertasSistemaService.alertasStockBajo', () => {
  it('la query exige ventas en los últimos 90 días, no solo stockMinimo > stock', async () => {
    const { svc, query } = buildService({ 'FROM productos p': [{ cantidad: '3' }] });
    await svc.getAlertas();

    const llamada = query.mock.calls.find(([sql]) => sql.includes('FROM productos p'));
    expect(llamada).toBeDefined();
    const sql = llamada![0] as string;
    expect(sql).toContain('factura_detalles');
    expect(sql).toContain("INTERVAL '90 days'");
  });

  it('la ruta del aviso lleva el filtro directo, no el módulo genérico', async () => {
    const { svc } = buildService({ 'FROM productos p': [{ cantidad: '3' }] });
    const { alertas } = await svc.getAlertas();
    const stockBajo = alertas.find(a => a.id === 'stock-bajo');
    expect(stockBajo?.ruta).toBe('/productos?filtro=stock-bajo');
  });

  it('sin productos con ventas recientes por debajo del mínimo, no genera el aviso', async () => {
    const { svc } = buildService({ 'FROM productos p': [{ cantidad: '0' }] });
    const { alertas } = await svc.getAlertas();
    expect(alertas.find(a => a.id === 'stock-bajo')).toBeUndefined();
  });
});

describe('AlertasSistemaService — rutas con filtro directo', () => {
  it('facturas en borrador antiguas enlaza con estado y antigüedad', async () => {
    const { svc } = buildService({ 'FROM facturas\n      WHERE': [{ cantidad: '1' }] });
    const { alertas } = await svc.getAlertas();
    const item = alertas.find(a => a.id === 'facturas-borrador');
    expect(item?.ruta).toBe('/facturas?estado=borrador&diasMin=3');
  });

  it('descuadre de caja enlaza con el historial filtrado por descuadre', async () => {
    const { svc } = buildService({ 'FROM cierres_caja': [{ cantidad: '2', monto: '450.00' }] });
    const { alertas } = await svc.getAlertas();
    const item = alertas.find(a => a.id === 'cierre-descuadre');
    expect(item?.ruta).toBe('/caja?tab=historial&descuadre=1');
  });
});
