/**
 * TesoreriaService.registrarDeposito()/registrarRetiro() — asiento contable
 * (2026-09-19). Antes de esta pieza, un movimiento MANUAL en Tesorería
 * (sin CxC/CxP de por medio) quedaba solo en movimientos_bancarios, sin
 * llegar nunca al mayor contable — dos libros en paralelo que podían
 * divergir sin que nadie lo notara. registrarTransferencia() sigue sin
 * generar asiento (ambos lados serían la misma cuenta "Bancos", ver
 * comentario en asientos-automaticos.service.ts) — no se prueba aquí
 * porque no cambió.
 */

import { TesoreriaService } from './tesoreria.service';

const CUENTA_BANCARIA = { id: 1, empresaId: 7, saldo: 1000, isActiva: true };

function makeService() {
  const cuentaRepository: any = {
    findOne: jest.fn().mockResolvedValue(CUENTA_BANCARIA),
    update:  jest.fn().mockResolvedValue({}),
  };
  const movimientoRepository: any = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 900, ...data })),
  };
  const asientosService: any = {
    asientoMovimientoBancario:      jest.fn().mockResolvedValue(undefined),
    previsualizarMovimientoBancario: jest.fn().mockResolvedValue({ ok: true, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: true }),
  };
  const tenantService: any = { getEmpresaId: () => 7 };

  const svc: any = Object.create(TesoreriaService.prototype);
  svc.logger               = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository     = cuentaRepository;
  svc.movimientoRepository = movimientoRepository;
  svc.tenantService        = tenantService;
  svc.asientosService      = asientosService;
  return { svc, asientosService, movimientoRepository };
}

describe('TesoreriaService.registrarDeposito() — genera el asiento', () => {
  it('sin cuentaContrapartida: la pasa como undefined, no marca manual', async () => {
    const { svc, asientosService } = makeService();

    await svc.registrarDeposito({ cuentaBancariaId: 1, monto: 500, fecha: '2026-09-19', descripcion: 'Aporte' }, 5);

    expect(asientosService.asientoMovimientoBancario).toHaveBeenCalledWith(
      900, 500, 'Aporte', true, '2026-09-19', 5, undefined, false,
    );
  });

  it('con cuentaContrapartida elegida: la pasa y la marca manual', async () => {
    const { svc, asientosService } = makeService();

    await svc.registrarDeposito({ cuentaBancariaId: 1, monto: 500, fecha: '2026-09-19', descripcion: 'Aporte', cuentaContrapartida: '3.1.1.01' }, 5);

    expect(asientosService.asientoMovimientoBancario).toHaveBeenCalledWith(
      900, 500, 'Aporte', true, '2026-09-19', 5, '3.1.1.01', true,
    );
  });

  it('si el asiento falla, el movimiento ya quedó registrado (no se propaga el error)', async () => {
    const { svc, asientosService } = makeService();
    asientosService.asientoMovimientoBancario.mockRejectedValueOnce(new Error('boom'));

    const resultado = await svc.registrarDeposito({ cuentaBancariaId: 1, monto: 500, fecha: '2026-09-19', descripcion: 'Aporte' }, 5);

    expect(resultado.id).toBe(900);
  });
});

describe('TesoreriaService.registrarRetiro() — genera el asiento', () => {
  it('pasa esDeposito=false al motor', async () => {
    const { svc, asientosService } = makeService();

    await svc.registrarRetiro({ cuentaBancariaId: 1, monto: 300, fecha: '2026-09-19', descripcion: 'Comisión' }, 5);

    expect(asientosService.asientoMovimientoBancario).toHaveBeenCalledWith(
      900, 300, 'Comisión', false, '2026-09-19', 5, undefined, false,
    );
  });
});

describe('TesoreriaService.previsualizarAsientoMovimiento()', () => {
  it('delega en el motor sin registrar ningún movimiento', async () => {
    const { svc, asientosService, movimientoRepository } = makeService();

    await svc.previsualizarAsientoMovimiento(500, 'Aporte', true, '3.1.1.01');

    expect(asientosService.previsualizarMovimientoBancario).toHaveBeenCalledWith(500, 'Aporte', true, '3.1.1.01');
    expect(movimientoRepository.save).not.toHaveBeenCalled();
  });
});
