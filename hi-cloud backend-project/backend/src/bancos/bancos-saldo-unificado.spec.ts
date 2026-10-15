/**
 * BancosService.listarCuentas() — saldo actual unificado (ver
 * common/cuentas-bancarias/saldo-cuenta-bancaria.util.ts). Incidente real
 * (2026-10-15, empresa 53): la lista de "Cuentas Bancarias & Conciliación"
 * solo mostraba `saldoInicial`, ignorando cualquier saldo que esa MISMA fila
 * tuviera por el lado de tesorería o movimientos de bancos_conciliacion.
 */
import { BancosService } from './bancos.service';

function makeService(opts: {
  cuentas: any[];
  filaUnificada: Record<number, { saldoActual: string; nombre: string; banco: string; numeroCuenta: string }>;
}) {
  const cuentaRepo: any = {
    find: jest.fn().mockResolvedValue(opts.cuentas),
    manager: {
      query: jest.fn().mockImplementation((sql: string, params: any[]) => {
        const empresaId = params[0];
        const filas = opts.cuentas
          .filter(c => c.empresaId === empresaId)
          .map(c => opts.filaUnificada[c.id])
          .filter(Boolean);
        return Promise.resolve(filas.map((f, i) => ({ id: opts.cuentas[i]?.id, ...f })));
      }),
    },
  };
  const svc: any = Object.create(BancosService.prototype);
  svc.logger = { log: jest.fn() };
  svc.cuentaRepo = cuentaRepo;
  svc.tenantService = { getEmpresaId: () => 53 };
  return { svc, cuentaRepo };
}

describe('BancosService.listarCuentas — saldo actual unificado', () => {
  it('cuenta con solo saldo inicial (sin movimientos): saldoActual = saldoInicial', async () => {
    const cuentas = [{ id: 7, empresaId: 53, nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851', saldoInicial: 16202.56 }];
    const { svc } = makeService({
      cuentas,
      filaUnificada: { 7: { saldoActual: '16202.56', nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851' } },
    });
    const r = await svc.listarCuentas();
    expect(r[0].saldoActual).toBe(16202.56);
    expect(r[0].saldoInicial).toBe(16202.56); // sigue disponible para el formulario de edición
  });

  it('cuenta con saldo inicial y movimientos de conciliación: saldoActual los incluye', async () => {
    const cuentas = [{ id: 9, empresaId: 53, nombre: 'Cuenta con movimientos', banco: 'BHD', numeroCuenta: '1234567890', saldoInicial: 10000 }];
    const { svc } = makeService({
      cuentas,
      // 10000 inicial + 10000 crédito − 1300 débito = 18700 (resuelto en SQL, aquí solo se verifica que se propaga)
      filaUnificada: { 9: { saldoActual: '18700.00', nombre: 'Cuenta con movimientos', banco: 'BHD', numeroCuenta: '1234567890' } },
    });
    const r = await svc.listarCuentas();
    expect(r[0].saldoActual).toBe(18700);
  });

  it('sin fila unificada (fallback defensivo): usa saldoInicial tal cual, nunca revienta', async () => {
    const cuentas = [{ id: 1, empresaId: 53, nombre: 'Cuenta nueva', banco: 'Popular', numeroCuenta: '000', saldoInicial: 500 }];
    const { svc } = makeService({ cuentas, filaUnificada: {} });
    const r = await svc.listarCuentas();
    expect(r[0].saldoActual).toBe(500);
  });
});
