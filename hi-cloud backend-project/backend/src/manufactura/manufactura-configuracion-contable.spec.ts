/**
 * ManufacturaService — Configuración Contable por Módulo (2026-09-19). Las
 * cuentas de WIP/Producto Terminado/MOD vivían como literales sueltos
 * dentro de este archivo, sin pasar por ningún catálogo configurable.
 * Inventario reusa el mismo concepto que Ventas/Compras (es la misma
 * cuenta física). Cobertura: los 3 métodos de asiento (inicio, cierre,
 * reversión) resuelven contra la configuración, y un fallo al resolver
 * nunca tumba el asiento de producción (cae a los mismos literales de siempre).
 */

import { ManufacturaService } from './manufactura.service';
import { EstadoOrdenProduccion } from './entities/orden-produccion.entity';

const CUENTAS_CONFIGURADAS = { INVENTARIO: '9.1.1', MANUFACTURA_WIP: '9.1.2', MANUFACTURA_PT: '9.1.3', MANUFACTURA_MOD: '9.1.4' };

function makeService(configuracionServiceOverride?: any) {
  const compRepo: any = { find: jest.fn().mockResolvedValue([{ productoId: 1, cantidad: 2 }]) };
  const prodRepo: any = { find: jest.fn().mockResolvedValue([{ id: 1, costoPromedio: 50 }]) };
  const ordenRepo: any = { update: jest.fn().mockResolvedValue({}) };
  const dataSource: any = { query: jest.fn().mockResolvedValue([]) };
  const tenantService: any = { getEmpresaId: () => 7, getUserId: () => 5 };
  const asientosService: any = { crearAsientoContabilizado: jest.fn().mockResolvedValue({ id: 100 }) };
  const configuracionService = configuracionServiceOverride ?? {
    resolverCuenta: jest.fn((eid: number, concepto: string) => Promise.resolve((CUENTAS_CONFIGURADAS as any)[concepto])),
  };

  const svc: any = Object.create(ManufacturaService.prototype);
  svc.logger               = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.compRepo             = compRepo;
  svc.prodRepo             = prodRepo;
  svc.ordenRepo            = ordenRepo;
  svc.dataSource           = dataSource;
  svc.tenantService        = tenantService;
  svc.asientosService      = asientosService;
  svc.configuracionService = configuracionService;
  return { svc, asientosService, configuracionService };
}

const ORDEN = {
  id: 1, numero: 'OP-001', listaId: 10, cantidadPlanificada: 10,
  lista: { rendimiento: 1 }, estado: EstadoOrdenProduccion.PLANIFICADA,
};

describe('ManufacturaService — Configuración Contable', () => {
  it('_iniciarOrden: WIP e Inventario se resuelven contra la configuración', async () => {
    const { svc, asientosService } = makeService();

    await (svc as any)._iniciarOrden(ORDEN);

    const lineas = asientosService.crearAsientoContabilizado.mock.calls[0][0].lineas;
    expect(lineas.find((l: any) => l.debe > 0)?.codigo).toBe('9.1.2');  // WIP
    expect(lineas.find((l: any) => l.haber > 0)?.codigo).toBe('9.1.1'); // Inventario
  });

  it('_asientoCompletarOrden: PT/WIP/MOD se resuelven contra la configuración', async () => {
    const { svc, asientosService } = makeService();

    await (svc as any)._asientoCompletarOrden(ORDEN, 10, 500);

    const lineas = asientosService.crearAsientoContabilizado.mock.calls[0][0].lineas;
    expect(lineas.find((l: any) => l.codigo === '9.1.3')?.debe).toBe(500);  // PT
    expect(lineas.find((l: any) => l.codigo === '9.1.2')?.haber).toBe(500); // WIP liberado
  });

  it('_asientoRevertirInicio: Inventario/WIP se resuelven contra la configuración', async () => {
    const { svc, asientosService, configuracionService } = makeService();
    svc.dataSource.query.mockResolvedValue([{ totalDebe: '400.00' }]);

    await (svc as any)._asientoRevertirInicio({ ...ORDEN, asientoInicioId: 42 });

    const lineas = asientosService.crearAsientoContabilizado.mock.calls[0][0].lineas;
    expect(lineas.find((l: any) => l.codigo === '9.1.1')?.debe).toBe(400);
    expect(lineas.find((l: any) => l.codigo === '9.1.2')?.haber).toBe(400);
  });

  it('si falla la resolución de configuración, usa los mismos literales de siempre (nunca tumba el asiento)', async () => {
    const configuracionServiceRoto = { resolverCuenta: jest.fn().mockRejectedValue(new Error('boom')) };
    const { svc, asientosService } = makeService(configuracionServiceRoto);

    await (svc as any)._iniciarOrden(ORDEN);

    const lineas = asientosService.crearAsientoContabilizado.mock.calls[0][0].lineas;
    expect(lineas.find((l: any) => l.debe > 0)?.codigo).toBe('1.1.3.02'); // default de siempre
    expect(lineas.find((l: any) => l.haber > 0)?.codigo).toBe('1.1.3.01');
  });
});
