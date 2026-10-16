/**
 * TesoreriaService.registrarMovimiento() (privado, probado vía
 * registrarDeposito) — ATÓMICO desde el incidente 2026-10-15 (empresa 53):
 * un cobro real de CxC incrementó `cuenta.saldo`, pero el INSERT del
 * movimiento falló después, y como las dos escrituras no estaban en una
 * transacción, el saldo quedó RD$24,000 más alto que su historial real.
 *
 * `cxc.service.ts` (y cxp/nómina/recibos-cobro, el mismo patrón) llaman a
 * tesorería con `.catch(err => logger.error(...))` — si el INSERT del
 * movimiento falla, ese catch solo lo deja en el log del servidor, nunca
 * revierte nada por su cuenta. La única defensa real es que las DOS
 * escrituras (saldo + movimiento) vivan en la MISMA transacción de base de
 * datos, para que Postgres las revierta juntas.
 *
 * Esta prueba no puede ver un ROLLBACK real (el mock no es una base de
 * datos) — confirma lo que SÍ puede verse desde JavaScript: que el fallo
 * del INSERT se propaga como el resultado de `registrarMovimiento` en vez
 * de perderse en silencio, que es lo que activa el ROLLBACK real de
 * Postgres cuando esto corre dentro de `manager.transaction()`.
 */
import { TesoreriaService } from './tesoreria.service';
import { CuentaBancaria } from './entities/cuenta-bancaria.entity';

function makeService() {
  const cuenta = { id: 7, empresaId: 53, saldo: 16202.56, isActiva: true, isActive: true };
  const cuentaRepository: any = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn().mockImplementation((id: number, cambios: any) => {
      Object.assign(cuenta, cambios);
      return Promise.resolve({});
    }),
  };
  const movimientoRepository: any = {
    create: jest.fn((data: any) => data),
    save:   jest.fn().mockRejectedValue(new Error('constraint violation simulada')),
  };

  let transactionUsada = false;
  cuentaRepository.manager = {
    transaction: (cb: (manager: any) => Promise<any>) => {
      transactionUsada = true;
      return cb({
        getRepository: (entity: any) => entity === CuentaBancaria ? cuentaRepository : movimientoRepository,
      });
    },
  };

  const svc: any = Object.create(TesoreriaService.prototype);
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository = cuentaRepository;
  svc.movimientoRepository = movimientoRepository;
  svc.tenantService = { getEmpresaId: () => 53 };
  svc.asientosService = { asientoMovimientoBancario: jest.fn().mockResolvedValue(undefined) };
  return { svc, cuenta, getTransactionUsada: () => transactionUsada };
}

describe('registrarMovimiento — atomicidad (vía registrarDeposito)', () => {
  it('pasa por manager.transaction — nunca escribe el saldo y el movimiento por fuera de una transacción', async () => {
    const cuentaRepository: any = {
      findOne: jest.fn().mockResolvedValue({ id: 7, empresaId: 53, saldo: 100, isActiva: true, isActive: true }),
      update:  jest.fn().mockResolvedValue({}),
    };
    const movimientoRepository: any = {
      create: jest.fn((d: any) => d),
      save:   jest.fn(async (d: any) => ({ id: 1, ...d })),
    };
    let usoTransaction = false;
    cuentaRepository.manager = {
      transaction: (cb: any) => { usoTransaction = true; return cb({ getRepository: (e: any) => e === CuentaBancaria ? cuentaRepository : movimientoRepository }); },
    };
    const svc: any = Object.create(TesoreriaService.prototype);
    svc.logger = { log: jest.fn(), error: jest.fn() };
    svc.cuentaRepository = cuentaRepository;
    svc.movimientoRepository = movimientoRepository;
    svc.tenantService = { getEmpresaId: () => 53 };
    svc.asientosService = { asientoMovimientoBancario: jest.fn().mockResolvedValue(undefined) };

    await svc.registrarDeposito({ cuentaBancariaId: 7, monto: 500, fecha: '2026-10-15', descripcion: 'Depósito' }, 78);
    expect(usoTransaction).toBe(true);
  });

  it('si el INSERT del movimiento falla, el error se propaga (nunca queda solo en un .catch() silencioso del caller)', async () => {
    const { svc, getTransactionUsada } = makeService();
    await expect(
      svc.registrarDeposito({ cuentaBancariaId: 7, monto: 24000, fecha: '2026-10-15', descripcion: 'Cobro CxC #246' }, 78),
    ).rejects.toThrow('constraint violation simulada');
    expect(getTransactionUsada()).toBe(true);
  });
});
