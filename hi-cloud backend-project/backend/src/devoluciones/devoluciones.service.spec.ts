/**
 * DevolucionesService — flujo NC → Devolución (código 1/3 aceptado por DGII)
 * y el guard bidireccional en procesar().
 *
 * COBERTURA (de la tarea "alimentar Devoluciones desde las notas de crédito"
 * + su auto-procesamiento posterior):
 * 1. crearDesdeNotaCredito con líneas con productoId: crea devolución ya
 *    PROCESADA, mueve inventario de una vez vía runForEmpresa (nunca
 *    TenantService.getEmpresaId() directo — corre fuera de contexto HTTP,
 *    desde el cron de DGII), vínculo NC↔devolución en ambos sentidos.
 * 2. Sin productoId en ninguna línea: no crea nada, reporta a Sentry, no lanza.
 * 3. Ya existe una devolución para esa NC (reintento del cron / carrera
 *    webhook+cron): no crea una segunda.
 * 4. Dos empresas: cada devolución generada usa el empresaId explícito de su
 *    propio payload — nunca cruza tenants.
 * 5. procesar() de una devolución nacida de una NC: mueve stock (al almacén
 *    elegido, con cantidades ajustables) pero NO genera su propio asiento NI
 *    una segunda NC — su NC y el asiento de esa NC ya existen.
 * 6. procesar() de una devolución creada manualmente: sigue generando su
 *    propio asiento y su propia NC, exactamente como antes de esta tarea.
 * 7. anular() de una devolución PROCESADA: revierte el inventario (salida
 *    simétrica al almacenId que procesar() persistió) antes de anular; si
 *    no hay stock suficiente, aborta completo sin marcar nada.
 */
import { DevolucionesService } from './devoluciones.service';
import { EstadoDevolucion, TipoDevolucion } from './entities/devolucion.entity';
import { User } from '../users/users.entity';

jest.mock('../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));
import { reportServiceError } from '../common/observability/sentry';

function makeDevService() {
  let devIdSeq = 1000;
  const devRows: any[] = [];

  const devRepository = {
    findOne: jest.fn(async (opts: any) => {
      const where = opts?.where ?? {};
      if (where.notaCreditoId != null) {
        return devRows.find(d => d.notaCreditoId === where.notaCreditoId) ?? null;
      }
      if (where.id != null) {
        return devRows.find(d => d.id === where.id) ?? null;
      }
      return null;
    }),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (entity: any) => {
      const saved = { id: devIdSeq++, ...entity };
      devRows.push(saved);
      return saved;
    }),
    update: jest.fn().mockResolvedValue({}),
  };

  const detalleRepository = {
    create: jest.fn((arr: any[]) => arr),
    save: jest.fn().mockResolvedValue([]),
  };

  const facturaRepository = {};

  const ncRepository = {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (entity: any) => ({ id: 9000, ...entity })),
    update: jest.fn().mockResolvedValue({}),
  };

  const ncDetRepository = {
    create: jest.fn((arr: any[]) => arr),
    save: jest.fn().mockResolvedValue([]),
  };

  const inventarioService = {
    registrarDevolucion: jest.fn().mockResolvedValue(undefined),
    registrarSalida:     jest.fn().mockResolvedValue(undefined),
  };
  const asientosService   = { asientoDevolucionVenta: jest.fn().mockResolvedValue(undefined) };
  const tenantService = {
    getEmpresaId: jest.fn(() => 7),
    // Igual que la implementación real cuando ya hay CLS activo: solo corre
    // fn() — el fake no necesita simular el cambio de contexto en sí mismo,
    // los tests verifican QUE se llamó, no el aislamiento de CLS (eso ya lo
    // cubre TenantService en su propio spec).
    runForEmpresa: jest.fn((_empresaId: number, fn: () => Promise<any>) => fn()),
  };

  let detallesNcFixture: any[] = [];
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('siguiente_numero_secuencia')) return [{ numero: devIdSeq }];
      if (sql.includes('FROM nota_credito_detalles')) return detallesNcFixture;
      return [];
    }),
  };

  const svc = new DevolucionesService(
    devRepository as any, detalleRepository as any, facturaRepository as any,
    ncRepository as any, ncDetRepository as any,
    inventarioService as any, asientosService as any, tenantService as any, ds as any,
  );

  return {
    svc, devRows, devRepository, detalleRepository, ncRepository, ncDetRepository,
    inventarioService, asientosService, tenantService, ds,
    setDetallesNc: (rows: any[]) => { detallesNcFixture = rows; },
  };
}

function seedDevolucion(devRows: any[], overrides: any = {}) {
  const dev = {
    id: 500, empresaId: 7, numero: 'DEV-500', fecha: '2026-09-01',
    tipo: TipoDevolucion.PARCIAL, estado: EstadoDevolucion.PENDIENTE,
    facturaId: 10, factura: { folio: 'FAC-10' }, clienteId: 3,
    motivo: 'motivo de prueba', userId: 9,
    subtotal: 200, iva: 36, total: 236,
    notaCreditoId: undefined, notaCreditoNumero: undefined,
    detalles: [
      { id: 1, productoId: 55, descripcion: 'Prod A', cantidad: 2, precioUnitario: 100, porcentajeIva: 18, subtotal: 200, importeIva: 36, total: 236 },
    ],
    ...overrides,
  };
  devRows.push(dev);
  return dev;
}

const usuario = { id: 9 } as User;

describe('DevolucionesService.crearDesdeNotaCredito', () => {
  it('con productoId en las líneas: crea devolución PROCESADA, mueve inventario vía runForEmpresa, vínculo NC↔devolución', async () => {
    const { svc, ncRepository, tenantService, inventarioService, setDetallesNc } = makeDevService();
    setDetallesNc([
      { productoId: 55, descripcion: 'Prod A', cantidad: '2', precioUnitario: '100', porcentajeIva: '18', subtotal: '200', iva: '36', total: '236' },
    ]);

    const dev = await svc.crearDesdeNotaCredito({
      empresaId: 7, ncId: 900, ncNumero: 'NC-900', facturaOriginalId: 55,
      clienteId: 3, usuarioId: 9, codigoModificacion: 3,
    });

    expect(dev).not.toBeNull();
    expect(dev!.empresaId).toBe(7);
    expect(dev!.estado).toBe(EstadoDevolucion.PROCESADA);
    expect(dev!.notaCreditoId).toBe(900);
    expect(dev!.notaCreditoNumero).toBe('NC-900');
    expect(ncRepository.update).toHaveBeenCalledWith(
      { id: 900, empresaId: 7 },
      expect.objectContaining({ devolucionId: dev!.id, devolucionNumero: dev!.numero }),
    );
    // Mueve stock de una vez, envuelto en runForEmpresa (nunca
    // TenantService.getEmpresaId() directo — corre fuera de contexto HTTP).
    expect(tenantService.getEmpresaId).not.toHaveBeenCalled();
    expect(tenantService.runForEmpresa).toHaveBeenCalledWith(7, expect.any(Function));
    expect(inventarioService.registrarDevolucion).toHaveBeenCalledWith(
      55, 2, 9, expect.any(String), dev!.numero,
    );
  });

  it('código 1 (anulación total): tipo TOTAL — código 3: tipo PARCIAL', async () => {
    const { svc, setDetallesNc } = makeDevService();
    setDetallesNc([{ productoId: 1, descripcion: 'X', cantidad: '1', precioUnitario: '1', porcentajeIva: '18', subtotal: '1', iva: '0.18', total: '1.18' }]);

    const devTotal = await svc.crearDesdeNotaCredito({
      empresaId: 7, ncId: 1, ncNumero: 'NC-1', facturaOriginalId: 1, clienteId: 1, usuarioId: 1, codigoModificacion: 1,
    });
    expect(devTotal!.tipo).toBe(TipoDevolucion.TOTAL);

    const devParcial = await svc.crearDesdeNotaCredito({
      empresaId: 7, ncId: 2, ncNumero: 'NC-2', facturaOriginalId: 1, clienteId: 1, usuarioId: 1, codigoModificacion: 3,
    });
    expect(devParcial!.tipo).toBe(TipoDevolucion.PARCIAL);
  });

  it('sin productoId en ninguna línea: no crea devolución, reporta a Sentry, no lanza', async () => {
    const { svc, devRepository, setDetallesNc } = makeDevService();
    setDetallesNc([
      { productoId: null, descripcion: 'Ajuste de monto', cantidad: '1', precioUnitario: '100', porcentajeIva: '18', subtotal: '100', iva: '18', total: '118' },
    ]);

    const dev = await svc.crearDesdeNotaCredito({
      empresaId: 7, ncId: 901, ncNumero: 'NC-901', facturaOriginalId: 55,
      clienteId: 3, usuarioId: 9, codigoModificacion: 1,
    });

    expect(dev).toBeNull();
    expect(devRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error), 'devolucion_desde_nc_sin_producto', expect.objectContaining({ ncId: '901' }),
    );
  });

  it('mezcla de líneas: solo genera detalle para las que tienen productoId', async () => {
    const { svc, detalleRepository, setDetallesNc } = makeDevService();
    setDetallesNc([
      { productoId: 1, descripcion: 'Con producto', cantidad: '1', precioUnitario: '100', porcentajeIva: '18', subtotal: '100', iva: '18', total: '118' },
      { productoId: null, descripcion: 'Sin producto', cantidad: '1', precioUnitario: '50', porcentajeIva: '18', subtotal: '50', iva: '9', total: '59' },
    ]);

    const dev = await svc.crearDesdeNotaCredito({
      empresaId: 7, ncId: 902, ncNumero: 'NC-902', facturaOriginalId: 55, clienteId: 3, usuarioId: 9, codigoModificacion: 3,
    });

    expect(dev).not.toBeNull();
    expect(detalleRepository.create).toHaveBeenCalledWith([
      expect.objectContaining({ productoId: 1, devolucionId: dev!.id }),
    ]);
  });

  it('ya existe una devolución para esta NC (reintento del cron): no crea una segunda', async () => {
    const { svc, devRepository, setDetallesNc } = makeDevService();
    devRepository.findOne.mockResolvedValueOnce({ id: 1, notaCreditoId: 903 });
    setDetallesNc([{ productoId: 1, descripcion: 'X', cantidad: '1', precioUnitario: '1', porcentajeIva: '18', subtotal: '1', iva: '0.18', total: '1.18' }]);

    const dev = await svc.crearDesdeNotaCredito({
      empresaId: 7, ncId: 903, ncNumero: 'NC-903', facturaOriginalId: 55, clienteId: 3, usuarioId: 9, codigoModificacion: 3,
    });

    expect(dev).toBeNull();
    expect(devRepository.save).not.toHaveBeenCalled();
  });

  it('dos empresas: cada devolución generada usa el empresaId explícito de su propio payload', async () => {
    const { svc, setDetallesNc } = makeDevService();
    setDetallesNc([{ productoId: 1, descripcion: 'X', cantidad: '1', precioUnitario: '1', porcentajeIva: '18', subtotal: '1', iva: '0.18', total: '1.18' }]);

    const devA = await svc.crearDesdeNotaCredito({ empresaId: 44, ncId: 10, ncNumero: 'NC-A', facturaOriginalId: 1, clienteId: 1, usuarioId: 1, codigoModificacion: 3 });
    const devB = await svc.crearDesdeNotaCredito({ empresaId: 52, ncId: 11, ncNumero: 'NC-B', facturaOriginalId: 2, clienteId: 2, usuarioId: 2, codigoModificacion: 3 });

    expect(devA!.empresaId).toBe(44);
    expect(devB!.empresaId).toBe(52);
    expect(devA!.empresaId).not.toBe(devB!.empresaId);
  });
});

describe('DevolucionesService.procesar — guard bidireccional', () => {
  it('nacida de una NC (notaCreditoId ya asignado): mueve stock pero NO genera asiento propio ni una segunda NC', async () => {
    const { svc, devRows, inventarioService, asientosService, ncRepository } = makeDevService();
    seedDevolucion(devRows, { id: 501, notaCreditoId: 900, notaCreditoNumero: 'NC-900' });

    await svc.procesar(501, usuario);

    expect(inventarioService.registrarDevolucion).toHaveBeenCalledWith(
      55, 2, 9, expect.any(String), 'DEV-500', undefined,
    );
    expect(asientosService.asientoDevolucionVenta).not.toHaveBeenCalled();
    expect(ncRepository.save).not.toHaveBeenCalled();
  });

  it('creada manualmente (sin NC de origen): sigue generando su propio asiento y su propia NC', async () => {
    const { svc, devRows, inventarioService, asientosService, ncRepository } = makeDevService();
    seedDevolucion(devRows, { id: 502 });

    await svc.procesar(502, usuario);

    expect(inventarioService.registrarDevolucion).toHaveBeenCalled();
    expect(asientosService.asientoDevolucionVenta).toHaveBeenCalled();
    expect(ncRepository.save).toHaveBeenCalled();
  });

  it('confirmar recepción: usa el almacén elegido y respeta la cantidad ajustada por línea', async () => {
    const { svc, devRows, inventarioService } = makeDevService();
    const dev = seedDevolucion(devRows, { id: 503, notaCreditoId: 900, notaCreditoNumero: 'NC-900' });

    await svc.procesar(503, usuario, { almacenId: 4, detalles: [{ detalleId: dev.detalles[0].id, cantidad: 1 }] } as any);

    expect(inventarioService.registrarDevolucion).toHaveBeenCalledWith(
      55, 1, 9, expect.any(String), 'DEV-500', 4,
    );
  });

  it('persiste el almacenId elegido en la devolución al procesar', async () => {
    const { svc, devRows, devRepository } = makeDevService();
    seedDevolucion(devRows, { id: 504 });

    await svc.procesar(504, usuario, { almacenId: 4 } as any);

    expect(devRepository.update).toHaveBeenCalledWith(
      504, expect.objectContaining({ almacenId: 4 }),
    );
  });
});

describe('DevolucionesService.anular', () => {
  it('pendiente: solo marca anulada, no toca inventario', async () => {
    const { svc, devRows, devRepository, inventarioService } = makeDevService();
    seedDevolucion(devRows, { id: 601 });

    await svc.anular(601, usuario);

    expect(inventarioService.registrarSalida).not.toHaveBeenCalled();
    expect(devRepository.update).toHaveBeenCalledWith(601, { estado: EstadoDevolucion.ANULADA });
  });

  it('procesada: revierte el inventario (salida simétrica) al mismo almacén antes de anular', async () => {
    const { svc, devRows, inventarioService, devRepository } = makeDevService();
    seedDevolucion(devRows, { id: 602, estado: EstadoDevolucion.PROCESADA, almacenId: 4 });

    await svc.anular(602, usuario);

    expect(inventarioService.registrarSalida).toHaveBeenCalledWith(
      55, 2, 9, expect.any(String), 'DEV-500', 4,
    );
    expect(devRepository.update).toHaveBeenCalledWith(602, { estado: EstadoDevolucion.ANULADA });
  });

  it('ya anulada: rechaza sin tocar inventario ni volver a actualizar', async () => {
    const { svc, devRows, inventarioService, devRepository } = makeDevService();
    seedDevolucion(devRows, { id: 603, estado: EstadoDevolucion.ANULADA });

    await expect(svc.anular(603, usuario)).rejects.toThrow('ya está anulada');
    expect(inventarioService.registrarSalida).not.toHaveBeenCalled();
    expect(devRepository.update).not.toHaveBeenCalled();
  });

  it('procesada sin stock suficiente: registrarSalida lanza y la anulación se aborta (no queda a medias)', async () => {
    const { svc, devRows, inventarioService, devRepository } = makeDevService();
    seedDevolucion(devRows, { id: 604, estado: EstadoDevolucion.PROCESADA, almacenId: 4 });
    inventarioService.registrarSalida.mockRejectedValueOnce(new Error('Stock insuficiente'));

    await expect(svc.anular(604, usuario)).rejects.toThrow('Stock insuficiente');
    expect(devRepository.update).not.toHaveBeenCalled();
  });
});
