/**
 * Bloque 1 — reconciliación 606/IR-2: cxp.service.ts::resolverYActualizarFormaPago().
 *
 * Compra.formaPago (código DGII 01-07) se re-resuelve desde los
 * PagoRealizado ACTIVOS de la CxP cada vez que se registra o se anula un
 * pago — se prefiere el dato real sobre la sugerencia que se puso al crear
 * la OC (que era una suposición: contado → efectivo por defecto).
 *
 * - Un solo método → se traduce directo (dgii.constants.ts::mapFormaPagoDgii).
 * - Varios métodos distintos entre abonos parciales → '07' Mixto (DGII ya
 *   tiene código exacto para esto, no hay que adivinar "el más reciente").
 * - 'otro' (sin traducción DGII confiable) como único método → no pisa lo
 *   que la compra ya tenía.
 * - Sin pagos activos (todos anulados) → tampoco pisa nada.
 */

import { CxPService } from './cxp.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';

function makeService(opts: {
  cuenta?: any;
  pago?: any;
  pagosActivos: { metodoPago: string }[];
}) {
  // montoOriginal bien por encima de lo que paga cada test — así ninguno
  // salda accidentalmente la cuenta y dispara el update(compraId,
  // {estado:'pagada'}) que ya existía (código no relacionado con esta
  // prueba), que confundiría las aserciones sobre compraRepository.update.
  const cuenta = opts.cuenta ?? {
    id: 30, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
    montoPendiente: 1000, montoPagado: 0, montoOriginal: 1000, moneda: 'DOP', tipoCambio: 1, compraId: 20,
  };
  const cxpRepository = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn().mockResolvedValue({}),
  };
  const pagoRepository = {
    create:  jest.fn((data: any) => data),
    save:    jest.fn(async (data: any) => ({ id: 700, ...data })),
    findOne: jest.fn().mockResolvedValue(opts.pago),
    find:    jest.fn().mockResolvedValue(opts.pagosActivos),
  };
  const compraRepository = {
    update: jest.fn().mockResolvedValue({}),
    manager: {
      transaction: jest.fn(async (cb: any) => cb({
        getRepository: () => ({ update: jest.fn().mockResolvedValue({}) }),
      })),
    },
  };
  const asientosService = {
    asientoPago:      jest.fn().mockResolvedValue(undefined),
    asientoPagoME:    jest.fn().mockResolvedValue(undefined),
    revertirAsiento:  jest.fn().mockResolvedValue({ id: 1 }),
  };
  const tesoreriaService = { registrarMovimientoAutomatico: jest.fn().mockResolvedValue(undefined) };
  const realtimeService  = { notify: jest.fn() };
  const tenantService    = { getEmpresaId: () => cuenta.empresaId };

  const svc: any = Object.create(CxPService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cxpRepository      = cxpRepository;
  svc.pagoRepository     = pagoRepository;
  svc.compraRepository   = compraRepository;
  svc.asientosService    = asientosService;
  svc.tesoreriaService   = tesoreriaService;
  svc.realtimeService    = realtimeService;
  svc.tenantService      = tenantService;
  return { svc, compraRepository, cuenta };
}

describe('CxPService — resolverYActualizarFormaPago() tras registrarPago()', () => {
  it('un solo pago en efectivo: compras.formaPago = 01', async () => {
    const { svc, compraRepository } = makeService({
      pagosActivos: [{ metodoPago: 'efectivo' }],
    });
    await svc.registrarPago(30, { monto: 300, metodoPago: 'efectivo' }, 5);
    expect(compraRepository.update).toHaveBeenCalledWith(20, { formaPago: '01' });
  });

  it('varios pagos parciales con métodos distintos: compras.formaPago = 07 (Mixto)', async () => {
    const { svc, compraRepository } = makeService({
      pagosActivos: [{ metodoPago: 'efectivo' }, { metodoPago: 'transferencia' }],
    });
    await svc.registrarPago(30, { monto: 100, metodoPago: 'transferencia' }, 5);
    expect(compraRepository.update).toHaveBeenCalledWith(20, { formaPago: '07' });
  });

  it("único método 'otro' (sin traducción DGII confiable): no pisa formaPago", async () => {
    const { svc, compraRepository } = makeService({
      pagosActivos: [{ metodoPago: 'otro' }],
    });
    await svc.registrarPago(30, { monto: 300, metodoPago: 'otro' }, 5);
    expect(compraRepository.update).not.toHaveBeenCalled();
  });

  it('un fallo al resolver formaPago no rompe el registro del pago', async () => {
    const { svc } = makeService({ pagosActivos: [] });
    // find() explota — resolverYActualizarFormaPago debe tragarlo (.catch en el caller).
    svc.pagoRepository.find = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(svc.registrarPago(30, { monto: 300, metodoPago: 'efectivo' }, 5)).resolves.toBeDefined();
  });
});

describe('CxPService — resolverYActualizarFormaPago() tras anularPago()', () => {
  it('al anular uno de dos pagos con métodos distintos, el restante uniforme re-resuelve el código exacto', async () => {
    const pago   = { id: 700, cuentaPorPagarId: 30, monto: 100, isActive: true };
    const cuenta = { id: 30, empresaId: 7, montoPagado: 400, montoOriginal: 1000, compraId: 20 };
    const { svc, compraRepository } = makeService({
      cuenta, pago,
      pagosActivos: [{ metodoPago: 'tarjeta' }], // el que queda tras anular el de transferencia
    });

    await svc.anularPago(700);

    expect(compraRepository.update).toHaveBeenCalledWith(20, { formaPago: '03' });
  });

  it('al anular el único pago activo (sin pagos restantes), no pisa formaPago', async () => {
    const pago   = { id: 700, cuentaPorPagarId: 30, monto: 300, isActive: true };
    const cuenta = { id: 30, empresaId: 7, montoPagado: 300, montoOriginal: 300, compraId: 20 };
    const { svc, compraRepository } = makeService({
      cuenta, pago,
      pagosActivos: [], // ya no queda ninguno activo
    });

    await svc.anularPago(700);

    expect(compraRepository.update).not.toHaveBeenCalled();
  });
});
