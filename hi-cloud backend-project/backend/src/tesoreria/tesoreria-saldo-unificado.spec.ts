/**
 * TesoreriaService.getDashboard() — saldo actual unificado + etiqueta con
 * alias (ver common/cuentas-bancarias/saldo-cuenta-bancaria.util.ts).
 * Incidente real (2026-10-15, empresa 53): el widget "Cuentas de Bancos" de
 * Inicio leía `c.saldo` directo (columna de tesorería) y mostraba RD$0.00 y
 * "SCOTIABANK" para una cuenta que en realidad tenía RD$16,202.56 y un
 * nombre propio — registrada desde el módulo Bancos, que usa `saldoInicial`
 * y `nombre`, columnas que la entidad de tesorería ni conoce.
 */
import { TesoreriaService } from './tesoreria.service';

function makeService(opts: {
  cuentas: any[];
  filaUnificada: Record<number, { saldoActual: string; nombre: string; banco: string; numeroCuenta: string }>;
}) {
  const cuentaRepository: any = {
    find: jest.fn().mockResolvedValue(opts.cuentas),
    manager: {
      query: jest.fn().mockImplementation((sql: string, params: any[]) => {
        if (sql.includes('cuentas_bancarias')) {
          const empresaId = params[0];
          return Promise.resolve(
            opts.cuentas.filter(c => c.empresaId === empresaId).map(c => ({ id: c.id, ...opts.filaUnificada[c.id] })),
          );
        }
        return Promise.resolve([]);
      }),
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
  svc.tenantService = { getEmpresaId: () => 53 };
  return { svc };
}

describe('TesoreriaService.getDashboard — saldo actual unificado', () => {
  it('cuenta registrada desde Bancos (saldoInicial, sin saldo propio de tesorería): el widget ya no la muestra en RD$0.00', async () => {
    const cuentas = [{ id: 7, empresaId: 53, banco: 'SCOTIABANK', numeroCuenta: '63150001851', tipoCuenta: 'corriente', moneda: 'DOP', saldo: 0 }];
    const { svc } = makeService({
      cuentas,
      filaUnificada: { 7: { saldoActual: '16202.56', nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851' } },
    });
    const dash = await svc.getDashboard();
    expect(dash.cuentas[0].saldo).toBe(16202.56);
    expect(dash.balanceTotal).toBe(16202.56);
  });

  it('el nombre mostrado es alias + banco + últimos dígitos, nunca solo el banco', async () => {
    const cuentas = [{ id: 7, empresaId: 53, banco: 'SCOTIABANK', numeroCuenta: '63150001851', tipoCuenta: 'corriente', moneda: 'DOP', saldo: 0 }];
    const { svc } = makeService({
      cuentas,
      filaUnificada: { 7: { saldoActual: '16202.56', nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851' } },
    });
    const dash = await svc.getDashboard();
    expect(dash.cuentas[0].nombre).toBe('S.R LUBRI-GOMAS PENA CASTILLO — SCOTIABANK ···1851');
    expect(dash.cuentas[0].nombre).not.toBe('SCOTIABANK');
  });

  it('cuenta registrada desde Tesorería (saldo propio del libro, sin saldoInicial de bancos): sigue mostrando lo mismo que antes', async () => {
    const cuentas = [{ id: 4, empresaId: 53, banco: 'Banreservas', numeroCuenta: '9600815928', tipoCuenta: 'ahorros', moneda: 'DOP', saldo: 153777 }];
    const { svc } = makeService({
      cuentas,
      filaUnificada: { 4: { saldoActual: '153777.00', nombre: 'Fiordaliza Perez Ortiz', banco: 'Banreservas', numeroCuenta: '9600815928' } },
    });
    const dash = await svc.getDashboard();
    expect(dash.cuentas[0].saldo).toBe(153777);
  });

  it('balanceTotal suma el saldo actual unificado de todas las cuentas, no solo `c.saldo`', async () => {
    const cuentas = [
      { id: 7, empresaId: 53, banco: 'SCOTIABANK', numeroCuenta: '1', tipoCuenta: 'corriente', moneda: 'DOP', saldo: 0 },
      { id: 4, empresaId: 53, banco: 'Banreservas', numeroCuenta: '2', tipoCuenta: 'ahorros', moneda: 'DOP', saldo: 1000 },
    ];
    const { svc } = makeService({
      cuentas,
      filaUnificada: {
        7: { saldoActual: '16202.56', nombre: 'Cuenta A', banco: 'SCOTIABANK', numeroCuenta: '1' },
        4: { saldoActual: '1000.00',  nombre: 'Cuenta B', banco: 'Banreservas', numeroCuenta: '2' },
      },
    });
    const dash = await svc.getDashboard();
    expect(dash.balanceTotal).toBeCloseTo(17202.56, 2);
  });
});
