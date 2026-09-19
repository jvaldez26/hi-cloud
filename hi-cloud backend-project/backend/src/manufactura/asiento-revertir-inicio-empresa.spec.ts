/**
 * P3 Bloque 5 — ManufacturaService._asientoRevertirInicio() leía
 * asientos_contables por id SIN filtrar empresaId. "id" en
 * asientos_contables es un autoincremento GLOBAL, no aislado por tenant:
 * un orden.asientoInicioId corrupto o de otra empresa leería el totalDebe
 * de un asiento ajeno sin que nada lo impidiera.
 */

import { ManufacturaService } from './manufactura.service';

function makeService(empresaId: number) {
  const dataSource = { query: jest.fn().mockResolvedValue([{ totalDebe: '100.00' }]) };
  const tenantService = { getEmpresaId: () => empresaId, getUserId: () => 5 };
  const asientosService = { crearAsientoContabilizado: jest.fn().mockResolvedValue({ id: 1 }) };
  const ordenRepo = { update: jest.fn().mockResolvedValue({}) };
  const configuracionService = { resolverCuenta: jest.fn().mockResolvedValue('1.1.3.01') };

  const svc: any = Object.create(ManufacturaService.prototype);
  svc.logger          = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.dataSource       = dataSource;
  svc.tenantService    = tenantService;
  svc.asientosService  = asientosService;
  svc.configuracionService = configuracionService;
  svc.ordenRepo        = ordenRepo;
  return { svc: svc as ManufacturaService, dataSource };
}

describe('ManufacturaService._asientoRevertirInicio() — filtra por empresaId (P3 Bloque 5)', () => {
  it('la consulta del monto original incluye empresaId como segundo parámetro', async () => {
    const { svc, dataSource } = makeService(7);

    await (svc as any)._asientoRevertirInicio({ id: 1, numero: 'OP-1', asientoInicioId: 42 });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"empresaId" = $2'),
      [42, 7],
    );
  });
});
