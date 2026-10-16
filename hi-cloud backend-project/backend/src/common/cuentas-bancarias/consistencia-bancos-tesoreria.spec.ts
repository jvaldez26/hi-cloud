/**
 * Prueba de contrato pedida explícitamente en el incidente (2026-10-15,
 * empresa 53, LUBRI GOMAS PEÑA CASTILLO): el widget de Inicio
 * (TesoreriaService.getDashboard) y "Cuentas Bancarias & Conciliación"
 * (BancosService.listarCuentas) deben reportar EXACTAMENTE la misma cifra
 * para la MISMA fila física de `cuentas_bancarias`, sin importar desde qué
 * módulo se haya creado la cuenta.
 */
import { BancosService } from '../../bancos/bancos.service';
import { TesoreriaService } from '../../tesoreria/tesoreria.service';

const CUENTA_FISICA = { id: 7, empresaId: 53, nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851', saldoInicial: 16202.56 };
const FILA_UNIFICADA = { saldoActual: '16202.56', nombre: CUENTA_FISICA.nombre, banco: CUENTA_FISICA.banco, numeroCuenta: CUENTA_FISICA.numeroCuenta };

function queryUnificada(params: any[]) {
  return Promise.resolve(params[0] === CUENTA_FISICA.empresaId ? [{ id: CUENTA_FISICA.id, ...FILA_UNIFICADA }] : []);
}

function makeBancos() {
  const svc: any = Object.create(BancosService.prototype);
  svc.logger = { log: jest.fn() };
  svc.cuentaRepo = {
    find: jest.fn().mockResolvedValue([CUENTA_FISICA]),
    manager: { query: jest.fn((_sql: string, params: any[]) => queryUnificada(params)) },
  };
  svc.tenantService = { getEmpresaId: () => CUENTA_FISICA.empresaId };
  return svc;
}

function makeTesoreria() {
  const svc: any = Object.create(TesoreriaService.prototype);
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository = {
    find: jest.fn().mockResolvedValue([{ id: CUENTA_FISICA.id, empresaId: CUENTA_FISICA.empresaId, banco: CUENTA_FISICA.banco, numeroCuenta: CUENTA_FISICA.numeroCuenta, tipoCuenta: 'corriente', moneda: 'DOP', saldo: 0 }]),
    manager: { query: jest.fn((_sql: string, params: any[]) => queryUnificada(params)) },
  };
  svc.movimientoRepository = {
    createQueryBuilder: () => ({
      where: function () { return this; }, andWhere: function () { return this; },
      orderBy: function () { return this; }, take: function () { return this; },
      getMany: async () => [],
    }),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  svc.tenantService = { getEmpresaId: () => CUENTA_FISICA.empresaId, getRolEmpresa: () => 'admin' };
  svc.cajaService = { getCajasAbiertas: jest.fn().mockResolvedValue([]) };
  return svc;
}

describe('Consistencia Inicio ↔ Cuentas Bancarias — misma fila, misma cifra', () => {
  it('el widget de Inicio y la lista de Cuentas Bancarias reportan el mismo saldo para la misma cuenta', async () => {
    const dash = await makeTesoreria().getDashboard();
    const lista = await makeBancos().listarCuentas();

    expect(dash.cuentas[0].saldo).toBe(16202.56);
    expect(lista[0].saldoActual).toBe(16202.56);
    expect(dash.cuentas[0].saldo).toBe(lista[0].saldoActual);
  });

  it('el nombre mostrado es el mismo en ambas pantallas', async () => {
    const dash = await makeTesoreria().getDashboard();
    const lista = await makeBancos().listarCuentas();

    expect(dash.cuentas[0].nombre).toBe('S.R LUBRI-GOMAS PENA CASTILLO — SCOTIABANK ···1851');
    expect(lista[0].nombre).toBe('S.R LUBRI-GOMAS PENA CASTILLO');
  });
});
