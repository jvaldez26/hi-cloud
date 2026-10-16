/**
 * TesoreriaService.getDashboard() — el widget "Cuentas de Bancos" de Inicio
 * mezclaba cuentas bancarias bajo un encabezado "Efectivo y Cuentas" aunque
 * nunca hubo efectivo real ahí (la respuesta solo traía `cuentas` de banco).
 * Ahora `cajas` (efectivo de cajas ABIERTA) es un grupo aparte, con la misma
 * regla de cierre ciego que CajaController 'caja/abiertas': solo ADMIN/
 * CONTADOR lo ven. Para VENDEDOR/VIEWER debe venir `null` (no `[]`/0) para
 * que el frontend pueda distinguir "sin permiso" de "sin cajas abiertas".
 */
import { TesoreriaService } from './tesoreria.service';

function makeService(opts: { rol: string; cajasAbiertas?: any[] }) {
  const cuentaRepository: any = {
    find: jest.fn().mockResolvedValue([
      { id: 7, empresaId: 53, banco: 'SCOTIABANK', numeroCuenta: '1', tipoCuenta: 'corriente', moneda: 'DOP', saldo: 0 },
    ]),
    manager: {
      query: jest.fn().mockResolvedValue([
        { id: 7, saldoActual: '16202.56', nombre: 'Cuenta A', banco: 'SCOTIABANK', numeroCuenta: '1' },
      ]),
    },
  };
  const movimientoRepository: any = {
    createQueryBuilder: () => ({
      where: function () { return this; }, andWhere: function () { return this; },
      orderBy: function () { return this; }, take: function () { return this; },
      getMany: async () => [],
    }),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const svc: any = Object.create(TesoreriaService.prototype);
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository = cuentaRepository;
  svc.movimientoRepository = movimientoRepository;
  svc.tenantService = { getEmpresaId: () => 53, getRolEmpresa: () => opts.rol };
  svc.cajaService = { getCajasAbiertas: jest.fn().mockResolvedValue(opts.cajasAbiertas ?? []) };
  return { svc };
}

describe('TesoreriaService.getDashboard — efectivo (cajas) separado de bancos (cuentas)', () => {
  it('ADMIN ve el grupo de efectivo con el esperado de cada caja abierta', async () => {
    const { svc } = makeService({
      rol: 'admin',
      cajasAbiertas: [
        { id: 812, vendedorNombre: 'Elvin Pena', sucursalId: 1, efectivoEsperado: 66420.39 },
      ],
    });
    const dash = await svc.getDashboard();
    expect(dash.cajas).toEqual([{ id: 812, cajero: 'Elvin Pena', sucursalId: 1, efectivoEsperado: 66420.39 }]);
    expect(dash.efectivoTotal).toBe(66420.39);
    expect(dash.totalDisponible).toBeCloseTo(16202.56 + 66420.39, 2);
  });

  it('CONTADOR también ve el grupo de efectivo', async () => {
    const { svc } = makeService({ rol: 'contador', cajasAbiertas: [] });
    const dash = await svc.getDashboard();
    expect(dash.cajas).toEqual([]);
    expect(dash.efectivoTotal).toBe(0);
  });

  it('VENDEDOR: cajas y efectivoTotal vienen null (cierre ciego) — nunca [] ni 0', async () => {
    const { svc } = makeService({
      rol: 'vendedor',
      cajasAbiertas: [{ id: 812, vendedorNombre: 'Elvin Pena', efectivoEsperado: 66420.39 }],
    });
    const dash = await svc.getDashboard();
    expect(dash.cajas).toBeNull();
    expect(dash.efectivoTotal).toBeNull();
    expect(dash.totalDisponible).toBeNull();
    expect(svc.cajaService.getCajasAbiertas).not.toHaveBeenCalled();
  });

  it('VIEWER: igual que VENDEDOR, no ve efectivo', async () => {
    const { svc } = makeService({ rol: 'viewer' });
    const dash = await svc.getDashboard();
    expect(dash.cajas).toBeNull();
  });

  it('bancos (`cuentas`/`balanceTotal`) nunca se afectan por el rol', async () => {
    const admin = await makeService({ rol: 'admin' }).svc.getDashboard();
    const vendedor = await makeService({ rol: 'vendedor' }).svc.getDashboard();
    expect(admin.cuentas).toEqual(vendedor.cuentas);
    expect(admin.balanceTotal).toBe(vendedor.balanceTotal);
  });
});
