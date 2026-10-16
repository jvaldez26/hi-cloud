/**
 * TesoreriaService.ajustarSaldo() — única forma legítima de cambiar un
 * saldo fuera de una operación normal (incidente 2026-10-15, empresa 53:
 * el saldo de una cuenta subió RD$24,000 sin ningún movimiento ni motivo
 * que lo explicara, con cero rastro en audit_logs). Siempre pasa por
 * registrarMovimiento (mismo saldoAnterior/saldoNuevo/userId que cualquier
 * otro movimiento) y genera su asiento contable.
 */
import { BadRequestException } from '@nestjs/common';
import { TesoreriaService } from './tesoreria.service';
import { CuentaBancaria } from './entities/cuenta-bancaria.entity';
import { MovimientoBancario } from './entities/movimiento-bancario.entity';

function makeService(saldoActual = 16202.56) {
  const cuenta = { id: 7, empresaId: 53, saldo: saldoActual, isActiva: true, isActive: true };
  const cuentaRepository: any = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn().mockImplementation((id: number, cambios: any) => {
      Object.assign(cuenta, cambios);
      return Promise.resolve({});
    }),
  };
  const movimientoRepository: any = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 900, ...data })),
  };
  // registrarMovimiento() ahora es atómico (ver incidente 2026-10-15) — usa
  // cuentaRepository.manager.transaction(cb), y dentro pide los repos
  // transaccionales vía manager.getRepository(Entity). Aquí se devuelven los
  // MISMOS mocks de arriba, así que las aserciones existentes siguen valiendo.
  cuentaRepository.manager = {
    transaction: (cb: (manager: any) => Promise<any>) => cb({
      getRepository: (entity: any) => entity === CuentaBancaria ? cuentaRepository : movimientoRepository,
    }),
  };
  const asientosService: any = {
    asientoMovimientoBancario: jest.fn().mockResolvedValue(undefined),
  };
  const svc: any = Object.create(TesoreriaService.prototype);
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository = cuentaRepository;
  svc.movimientoRepository = movimientoRepository;
  svc.tenantService = { getEmpresaId: () => 53 };
  svc.asientosService = asientosService;
  return { svc, cuenta, movimientoRepository, asientosService };
}

describe('TesoreriaService.ajustarSaldo', () => {
  it('rechaza un ajuste de monto 0', async () => {
    const { svc } = makeService();
    await expect(
      svc.ajustarSaldo({ cuentaBancariaId: 7, monto: 0, fecha: '2026-10-15', motivo: 'prueba' }, 78),
    ).rejects.toThrow(BadRequestException);
  });

  it('monto positivo: aumenta el saldo y queda como DEPOSITO con origen "ajuste"', async () => {
    const { svc, cuenta, movimientoRepository } = makeService(16202.56);
    await svc.ajustarSaldo({ cuentaBancariaId: 7, monto: 24000, fecha: '2026-10-15', motivo: 'Depósito no registrado, confirmado con el cliente' }, 78);

    expect(cuenta.saldo).toBe(40202.56);
    const guardado = movimientoRepository.save.mock.calls[0][0];
    expect(guardado.tipo).toBe('deposito');
    expect(guardado.origen).toBe('ajuste');
    expect(guardado.descripcion).toContain('Ajuste de saldo: Depósito no registrado');
    expect(guardado.saldoAnterior).toBe(16202.56);
    expect(guardado.saldoNuevo).toBe(40202.56);
    expect(guardado.userId).toBe(78);
  });

  it('monto negativo: disminuye el saldo y queda como RETIRO', async () => {
    const { svc, cuenta } = makeService(40202.56);
    await svc.ajustarSaldo({ cuentaBancariaId: 7, monto: -200, fecha: '2026-10-15', motivo: 'Comisión bancaria no registrada' }, 78);
    expect(cuenta.saldo).toBe(40002.56);
  });

  it('genera el asiento contable del ajuste (igual que depósito/retiro normal)', async () => {
    const { svc, asientosService } = makeService();
    const mov = await svc.ajustarSaldo({ cuentaBancariaId: 7, monto: 500, fecha: '2026-10-15', motivo: 'Corrección' }, 78);
    expect(asientosService.asientoMovimientoBancario).toHaveBeenCalledWith(
      mov.id, 500, 'Ajuste de saldo: Corrección', true, '2026-10-15', 78, undefined, false,
    );
  });

  it('si el asiento falla, el movimiento ya quedó registrado (no se propaga el error)', async () => {
    const { svc, asientosService } = makeService();
    asientosService.asientoMovimientoBancario.mockRejectedValueOnce(new Error('boom'));
    const mov = await svc.ajustarSaldo({ cuentaBancariaId: 7, monto: 500, fecha: '2026-10-15', motivo: 'Corrección' }, 78);
    expect(mov.id).toBe(900);
  });
});
