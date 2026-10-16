/**
 * TesoreriaService.registrarDepositoEfectivo — efectivo que sale de una caja
 * abierta y entra a una cuenta bancaria (depósito físico con volante). Caso
 * real que motivó esto (2026-10-15, empresa 53): un cobro en EFECTIVO de CxC
 * se posteó directo al banco como si fuera un cobro bancario, sin pasar
 * nunca por una caja — el efectivo "desapareció" del cuadre del cajero.
 *
 * No corre en una sola transacción de BD (registrarRetiro y
 * registrarMovimiento usan locks/transacciones independientes) — por eso se
 * prueba explícitamente que, si el lado bancario falla DESPUÉS de sacar el
 * efectivo de caja, el retiro se revierte (anula) en vez de dejarlo
 * "perdido en tránsito".
 */
import { BadRequestException } from '@nestjs/common';
import { TesoreriaService } from './tesoreria.service';
import { OrigenMovimiento, TipoMovimientoBancario } from './entities/movimiento-bancario.entity';
import { CategoriaRetiro } from '../caja/entities/retiro-caja.entity';

function makeService(opts: {
  retiro: any;
  movimientoOk?: boolean;
  movimientoError?: Error;
}) {
  const registrarMovimientoMock = jest.fn();
  if (opts.movimientoError) {
    registrarMovimientoMock.mockRejectedValue(opts.movimientoError);
  } else {
    registrarMovimientoMock.mockResolvedValue({ id: 501, ...opts.retiro });
  }

  const cajaService = {
    registrarRetiro: jest.fn().mockResolvedValue(opts.retiro),
    anularRetiro: jest.fn().mockResolvedValue({}),
  };
  const asientosService = {
    asientoMovimientoBancario: jest.fn().mockResolvedValue({}),
  };

  const svc: any = Object.create(TesoreriaService.prototype);
  svc.logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
  svc.cajaService = cajaService;
  svc.asientosService = asientosService;
  svc.registrarMovimiento = registrarMovimientoMock;
  return { svc: svc as TesoreriaService, cajaService, asientosService, registrarMovimientoMock };
}

describe('TesoreriaService.registrarDepositoEfectivo', () => {
  const dto = { cajaId: 812, cuentaBancariaId: 7, monto: 24000, fecha: '2026-10-15', referencia: 'VOL-001' };

  it('camino feliz: retira de caja y registra el depósito bancario con la misma referencia', async () => {
    const { svc, cajaService, registrarMovimientoMock } = makeService({
      retiro: { id: 55, requiereAuth: false },
    });

    const result: any = await svc.registrarDepositoEfectivo(dto, 78, 'ELVIN PENA');

    expect(cajaService.registrarRetiro).toHaveBeenCalledWith(
      812, 24000, expect.stringContaining('VOL-001'), 78, 'ELVIN PENA',
      CategoriaRetiro.DEPOSITO_BANCO, 7,
    );
    expect(registrarMovimientoMock).toHaveBeenCalledWith(
      7, TipoMovimientoBancario.DEPOSITO, 24000, '2026-10-15',
      expect.stringContaining('VOL-001'), 78, OrigenMovimiento.DEPOSITO_EFECTIVO, 55, 'VOL-001',
    );
    expect(result.pendienteAutorizacion).toBe(false);
    expect(result.movimiento).toBeTruthy();
  });

  it('el retiro queda pendiente de autorización (supera el umbral): NO toca el banco todavía', async () => {
    const { svc, registrarMovimientoMock } = makeService({
      retiro: { id: 56, requiereAuth: true },
    });

    const result: any = await svc.registrarDepositoEfectivo(dto, 78, 'ELVIN PENA');

    expect(registrarMovimientoMock).not.toHaveBeenCalled();
    expect(result.pendienteAutorizacion).toBe(true);
    expect(result.movimiento).toBeNull();
  });

  it('si el movimiento bancario falla después del retiro: revierte (anula) el retiro y lanza error claro', async () => {
    const { svc, cajaService } = makeService({
      retiro: { id: 57, requiereAuth: false },
      movimientoError: new Error('cuenta inactiva'),
    });

    await expect(svc.registrarDepositoEfectivo(dto, 78, 'ELVIN PENA')).rejects.toThrow(BadRequestException);
    expect(cajaService.anularRetiro).toHaveBeenCalledWith(
      57, expect.stringContaining('falló'), 78, 'ELVIN PENA',
    );
  });
});
