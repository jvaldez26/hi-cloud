/**
 * Incidente real (2026-10-16, empresa 73, VENTAS DIVERSAS ELIDO): tres
 * recibos del POS ("Nuevo Recibo", cliente + monto, SIN "Factura de
 * referencia") se guardaron como REC-101/102/103 y las clientas seguían
 * debiendo exactamente lo mismo en Antigüedad de Saldos — crear() nunca
 * buscaba las CxC pendientes del cliente cuando no se eligió una factura
 * (gap presente desde el primer commit del módulo, no una regresión de hoy).
 *
 * Regla implementada: un recibo de un cliente con CxC SIEMPRE se aplica —
 * a la factura elegida, o si no se elige ninguna, a las más antiguas
 * primero (FIFO) hasta agotar el monto; el excedente queda como anticipo
 * con confirmación del cajero (igual que ya pasaba para una sola factura).
 */

import { RecibosCobrosService } from './recibos-cobro.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { BadRequestException } from '@nestjs/common';

function makeService(opts: {
  cxcFindOne?: any;
  cxcFind?: any[];
  empresaId?: number;
}) {
  const empresaId = opts.empresaId ?? 7;
  let reciboAutoId = 1000;
  const repo = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: reciboAutoId++, numero: 'REC-00001', ...data })),
  };
  const cxcRepo = {
    findOne: jest.fn().mockResolvedValue(opts.cxcFindOne ?? null),
    find:    jest.fn().mockResolvedValue(opts.cxcFind ?? []),
  };
  const facturaRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const anticipoRepo = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 9999, ...data })),
    update: jest.fn().mockResolvedValue({}),
  };

  let pagoAutoId = 500;
  const pagoRepoEm = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: pagoAutoId++, ...data })),
  };
  const cxcRepoEm    = { update: jest.fn().mockResolvedValue({}) };
  const facturaRepoEm = { update: jest.fn().mockResolvedValue({}) };

  const em = {
    getRepository: (entity: any) => {
      if (entity?.name === 'PagoCobrado')     return pagoRepoEm;
      if (entity?.name === 'CuentaPorCobrar') return cxcRepoEm;
      if (entity?.name === 'Factura')         return facturaRepoEm;
      throw new Error(`Entidad no mockeada: ${entity?.name}`);
    },
  };

  let secuencia = 1;
  const dataSource = {
    query: jest.fn((sql: string) => {
      if (sql.includes('cierres_caja')) return Promise.resolve([{ id: 900 }]);
      if (sql.includes('vendedores'))   return Promise.resolve([]);
      if (sql.includes('clientes'))     return Promise.resolve([{ nombre: 'Cliente de prueba' }]);
      // siguiente_numero_secuencia — un número distinto por llamada. Dos
      // formas de leerlo según quién llama: generarNumeroSecuencial()
      // (REC-/ANT-) espera la columna "numero"; el RDP de crear() la pide
      // como "n" directo (ver recibos-cobro.service.ts) — se devuelven
      // las dos para que cualquiera de los dos destructuring funcione.
      const n = secuencia++;
      return Promise.resolve([{ numero: n, n }]);
    }),
    transaction: jest.fn(async (cb: any) => cb(em)),
  };

  const asientosService = {
    asientoCobro:     jest.fn().mockResolvedValue(undefined),
    asientoRecibo:    jest.fn().mockResolvedValue(undefined),
    asientoAnticipo:  jest.fn().mockResolvedValue(undefined),
    asientoReversion: jest.fn().mockResolvedValue(undefined),
  };
  const tesoreriaService = { registrarMovimientoAutomatico: jest.fn().mockResolvedValue(undefined) };
  const tenantSvc = { getEmpresaId: () => empresaId };

  const svc: any = Object.create(RecibosCobrosService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.repo             = repo;
  svc.cxcRepo          = cxcRepo;
  svc.facturaRepo      = facturaRepo;
  svc.anticipoRepo     = anticipoRepo;
  svc.dataSource       = dataSource;
  svc.asientosService  = asientosService;
  svc.tesoreriaService = tesoreriaService;
  svc.tenantSvc        = tenantSvc;
  return { svc, repo, cxcRepo, pagoRepoEm, cxcRepoEm, asientosService, anticipoRepo, tesoreriaService, dataSource };
}

describe('RecibosCobrosService.crear — aplicación FIFO cuando no se elige factura', () => {
  it('recibo sin factura de referencia: se aplica a TODAS las CxC pendientes del cliente, de la más antigua a la más nueva', async () => {
    // Caso real: Karla Jiménez, RD$685.00 — exactamente la suma de sus 6 facturas pendientes.
    const pendientes = [
      { id: 221, clienteId: 228, montoPendiente: 115, montoPagado: 0, montoOriginal: 115, moneda: 'DOP', facturaId: 1, fechaVencimiento: '2026-11-04' },
      { id: 222, clienteId: 228, montoPendiente: 290, montoPagado: 0, montoOriginal: 290, moneda: 'DOP', facturaId: 2, fechaVencimiento: '2026-11-05' },
      { id: 231, clienteId: 228, montoPendiente: 40,  montoPagado: 0, montoOriginal: 40,  moneda: 'DOP', facturaId: 3, fechaVencimiento: '2026-11-06' },
      { id: 236, clienteId: 228, montoPendiente: 50,  montoPagado: 0, montoOriginal: 50,  moneda: 'DOP', facturaId: 4, fechaVencimiento: '2026-11-11' },
      { id: 237, clienteId: 228, montoPendiente: 40,  montoPagado: 0, montoOriginal: 40,  moneda: 'DOP', facturaId: 5, fechaVencimiento: '2026-11-11' },
      { id: 243, clienteId: 228, montoPendiente: 150, montoPagado: 0, montoOriginal: 150, moneda: 'DOP', facturaId: 6, fechaVencimiento: '2026-11-13' },
    ];
    const { svc, cxcRepo, pagoRepoEm, cxcRepoEm, asientosService } = makeService({ cxcFind: pendientes });

    const resultado = await svc.crear({
      clienteId: 228, monto: 685, metodoPago: 'efectivo', concepto: 'Recibo de cobro',
    }, 113);

    // Nunca buscó una sola CxC explícita — resolvió TODAS las pendientes del cliente.
    expect(cxcRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ clienteId: 228, empresaId: 7 }),
    }));

    // Las 6 CxC quedan pagadas — ninguna sigue con saldo pendiente.
    expect(cxcRepoEm.update).toHaveBeenCalledTimes(6);
    for (const p of pendientes) {
      expect(cxcRepoEm.update).toHaveBeenCalledWith(p.id, expect.objectContaining({
        montoPendiente: 0, estado: EstadoCuenta.PAGADA,
      }));
    }

    // Un pago (RDP) por cada CxC — no uno solo por el total.
    expect(pagoRepoEm.save).toHaveBeenCalledTimes(6);
    expect(asientosService.asientoCobro).toHaveBeenCalledTimes(6);

    // Nada quedó sin aplicar — resultado es el propio recibo, sin anticipo.
    expect((resultado as any).anticipo).toBeUndefined();
  });

  it('recibo CON factura de referencia: se aplica solo a esa, igual que siempre', async () => {
    const cxc = {
      id: 47, empresaId: 7, clienteId: 3, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 400, montoPagado: 0, montoOriginal: 400, moneda: 'DOP', tipoCambio: 1,
    };
    const otraPendiente = { id: 999, clienteId: 3, montoPendiente: 200, montoPagado: 0, montoOriginal: 200, moneda: 'DOP', facturaId: 55, fechaVencimiento: '2026-12-01' };
    const { svc, cxcRepo, pagoRepoEm } = makeService({ cxcFindOne: cxc, cxcFind: [otraPendiente] });

    await svc.crear({
      cxcId: 47, clienteId: 3, monto: 400, metodoPago: 'efectivo', concepto: 'Cobro',
    }, 5);

    // No consultó el listado de pendientes del cliente — ya tenía la factura elegida.
    expect(cxcRepo.find).not.toHaveBeenCalled();
    expect(pagoRepoEm.save).toHaveBeenCalledTimes(1);
    expect(pagoRepoEm.save).toHaveBeenCalledWith(expect.objectContaining({ cuentaPorCobrarId: 47, monto: 400 }));
  });

  it('excedente sobre el total pendiente (FIFO): pide confirmación antes de registrar el anticipo', async () => {
    const pendientes = [
      { id: 1, clienteId: 50, montoPendiente: 100, montoPagado: 0, montoOriginal: 100, moneda: 'DOP', facturaId: 1, fechaVencimiento: '2026-11-01' },
    ];
    const { svc } = makeService({ cxcFind: pendientes });

    await expect(svc.crear({
      clienteId: 50, monto: 150, metodoPago: 'efectivo', concepto: 'Recibo de cobro',
    }, 5)).rejects.toThrow(BadRequestException);

    await expect(svc.crear({
      clienteId: 50, monto: 150, metodoPago: 'efectivo', concepto: 'Recibo de cobro',
    }, 5)).rejects.toThrow('EXCEDENTE:50.00:100.00');
  });

  it('excedente confirmado (FIFO): paga todo lo pendiente y el resto queda como anticipo del cliente', async () => {
    const pendientes = [
      { id: 1, clienteId: 50, montoPendiente: 100, montoPagado: 0, montoOriginal: 100, moneda: 'DOP', facturaId: 1, fechaVencimiento: '2026-11-01' },
    ];
    const { svc, cxcRepoEm, anticipoRepo } = makeService({ cxcFind: pendientes });

    const resultado: any = await svc.crear({
      clienteId: 50, monto: 150, metodoPago: 'efectivo', concepto: 'Recibo de cobro',
      registrarExcedente: true,
    }, 5);

    expect(cxcRepoEm.update).toHaveBeenCalledWith(1, expect.objectContaining({ montoPendiente: 0, estado: EstadoCuenta.PAGADA }));
    expect(anticipoRepo.save).toHaveBeenCalledWith(expect.objectContaining({ monto: 50, clienteId: 50 }));
    expect(resultado.anticipo).toBeDefined();
    expect(resultado.anticipo.monto).toBe(50);
  });

  it('cliente conocido sin ninguna CxC pendiente: el monto completo queda como anticipo (regla explícita 2026-10-16), no como asiento genérico', async () => {
    const { svc, cxcRepo, pagoRepoEm, asientosService, anticipoRepo } = makeService({ cxcFind: [] });

    const resultado: any = await svc.crear({
      clienteId: 777, monto: 500, metodoPago: 'tarjeta', concepto: 'Recibo de cobro',
    }, 5);

    expect(cxcRepo.find).toHaveBeenCalled();
    expect(pagoRepoEm.save).not.toHaveBeenCalled();
    // Nunca queda en un asiento genérico anónimo — el cliente es conocido,
    // así que el dinero se guarda como SU anticipo, trazable.
    expect(asientosService.asientoRecibo).not.toHaveBeenCalled();
    expect(anticipoRepo.save).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 777, monto: 500 }));
    expect(resultado.anticipo).toBeDefined();
    expect(resultado.anticipo.monto).toBe(500);
  });

  it('SIN cliente (recibo genérico, sin nadie a quién imputarlo): sigue siendo el asiento genérico de siempre', async () => {
    const { svc, pagoRepoEm, asientosService, anticipoRepo, tesoreriaService } = makeService({ cxcFind: [] });

    await svc.crear({
      monto: 500, metodoPago: 'tarjeta', concepto: 'Recibo de cobro',
    }, 5);

    expect(pagoRepoEm.save).not.toHaveBeenCalled();
    expect(anticipoRepo.save).not.toHaveBeenCalled();
    expect(asientosService.asientoRecibo).toHaveBeenCalledWith(500, expect.any(Number), 'tarjeta', expect.any(String), 5);
    expect(tesoreriaService.registrarMovimientoAutomatico).toHaveBeenCalled();
  });

  it('numeración de recibos (REC-) es siempre continua y nunca choca con la de pagos (RDP-) — números independientes por llamada', async () => {
    const pendientes = [
      { id: 1, clienteId: 50, montoPendiente: 60, montoPagado: 0, montoOriginal: 60, moneda: 'DOP', facturaId: 1, fechaVencimiento: '2026-11-01' },
      { id: 2, clienteId: 50, montoPendiente: 40, montoPagado: 0, montoOriginal: 40, moneda: 'DOP', facturaId: 2, fechaVencimiento: '2026-11-02' },
    ];
    const { svc, pagoRepoEm } = makeService({ cxcFind: pendientes });

    await svc.crear({ clienteId: 50, monto: 100, metodoPago: 'efectivo', concepto: 'Recibo' }, 5);

    const numeros = pagoRepoEm.save.mock.calls.map((c: any) => c[0].numero);
    expect(numeros).toHaveLength(2);
    expect(new Set(numeros).size).toBe(2); // cada pago tiene su propio RDP, nunca repetido
    expect(numeros.every((n: string) => /^RDP-\d+$/.test(n))).toBe(true);
  });
});

describe('RecibosCobrosService.previsualizarAplicacion — "a qué facturas se aplicará" antes de grabar', () => {
  it('sin factura elegida: devuelve el mismo reparto FIFO que crear() va a aplicar de verdad', async () => {
    const pendientes = [
      { id: 1, clienteId: 50, montoPendiente: 60, montoPagado: 0, montoOriginal: 60, moneda: 'DOP', facturaId: 10, fechaVencimiento: '2026-11-01' },
      { id: 2, clienteId: 50, montoPendiente: 40, montoPagado: 0, montoOriginal: 40, moneda: 'DOP', facturaId: 20, fechaVencimiento: '2026-11-02' },
    ];
    const { svc } = makeService({ cxcFind: pendientes });

    const preview = await svc.previsualizarAplicacion(50, 90);

    expect(preview.aplicaciones).toEqual([
      { facturaId: 10, cxcId: 1, monto: 60 },
      { facturaId: 20, cxcId: 2, monto: 30 },
    ]);
    expect(preview.excedente).toBe(0);
  });

  it('con factura elegida: previsualiza solo esa, con el excedente si lo hay', async () => {
    const cxc = { id: 47, facturaId: 7, montoPendiente: 100, estado: EstadoCuenta.PENDIENTE };
    const { svc } = makeService({ cxcFindOne: cxc });

    const preview = await svc.previsualizarAplicacion(3, 150, 7);

    expect(preview.aplicaciones).toEqual([{ facturaId: 7, cxcId: 47, monto: 100 }]);
    expect(preview.excedente).toBe(50);
  });
});
