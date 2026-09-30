import { XlinkRecibirService } from './xlink-recibir.service';
import { XlinkEstadoReceptor, XlinkTipoDocumento } from './entities/xlink-documento.entity';

const EMPRESA = 7;
const USUARIO = { id: 1, nombre: 'Ana', email: 'ana@x.com' } as any;

function buildDeps() {
  const manager = { query: jest.fn().mockResolvedValue([]) };
  return {
    manager,
    ds: { transaction: jest.fn(async (cb: any) => cb(manager)), query: jest.fn().mockResolvedValue([]) },
    tenantSvc: {
      getEmpresaId: () => EMPRESA,
      runForEmpresa: jest.fn(async (_eid: number, fn: () => Promise<any>) => fn()),
    },
    auditoriaSvc: { registrar: jest.fn().mockResolvedValue(undefined) },
    xlinkRepo: {
      bloquearPorIdComoDestino: jest.fn(),
      buscarPorIdComoDestino: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorOrigenComoDestino: jest.fn().mockResolvedValue(null),
      guardar: jest.fn((doc: any) => Promise.resolve(doc)),
    },
    xlinkMapeos: {
      resolverProducto: jest.fn(),
      claveExterna: (sku: string | null, nombre: string) => sku ?? `__sin_sku__:${nombre}`,
    },
    comprasSvc: {
      create: jest.fn(),
      cambiarEstado: jest.fn().mockResolvedValue(undefined),
    },
    comprasPdfSvc: { generarOrdenCompraPDF: jest.fn() },
    cotizacionesSvc: { create: jest.fn() },
    nccSvc: { crear: jest.fn(), recibir: jest.fn().mockResolvedValue(undefined), anular: jest.fn().mockResolvedValue(undefined) },
    pdfSvc: { generarFacturaPDF: jest.fn() },
    ncPdfSvc: { generarPDF: jest.fn() },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): XlinkRecibirService {
  return new XlinkRecibirService(
    d.ds as any, d.tenantSvc as any, d.auditoriaSvc as any, d.xlinkRepo as any, d.xlinkMapeos as any,
    d.comprasSvc as any, d.comprasPdfSvc as any, d.cotizacionesSvc as any, d.nccSvc as any,
    d.pdfSvc as any, d.ncPdfSvc as any,
  );
}

const DOC_FACTURA_BASE = {
  id: 501, tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, origenEmpresaId: 3, destinoEmpresaId: EMPRESA,
  numeroOrigen: 'FAC-10', ncfOrigen: 'E310000000001', totalOrigen: 118,
  estadoReceptor: XlinkEstadoReceptor.PENDIENTE,
  snapshot: {
    encabezado: { fechaOrigen: '2026-09-29', moneda: 'DOP', tipoCambio: 1, tipoPago: 'CREDITO', diasCredito: 30 },
    lineas: [{ sku: 'A1', nombre: 'Producto A', cantidad: 1, unidad: 'UND', precioUnitario: 100, descuento: 0, porcentajeIva: 18, montoItem: 100 }],
  },
};

/** Mockea manager.query según el patrón SQL que contiene, en el orden que XlinkRecibirService las dispara para una factura feliz. */
function mockQueriesFacturaOk(d: ReturnType<typeof buildDeps>, overrides: { proveedor?: any; existente?: any } = {}) {
  d.manager.query.mockImplementation((sql: string) => {
    if (sql.includes('FROM empresa WHERE id')) return Promise.resolve([{ xlinkId: 'xlink-origen' }]);
    if (sql.includes('FROM proveedores')) return Promise.resolve(overrides.proveedor !== undefined ? [overrides.proveedor].filter(Boolean) : [{ id: 55, rnc: '130000000', sincronizarArticulosXlink: false }]);
    if (sql.includes('FROM compras')) return Promise.resolve(overrides.existente ? [overrides.existente] : []);
    if (sql.includes('UPDATE ecf_recibidos')) return Promise.resolve([]);
    if (sql.includes('SELECT "nombreComercial", nombre FROM empresa')) return Promise.resolve([{ nombreComercial: 'Mi Empresa' }]);
    return Promise.resolve([]);
  });
}

describe('XlinkRecibirService.recibir — Factura a Crédito → Compra', () => {
  it('recibe correctamente: crea Compra, la marca RECIBIDA, y marca el xlink_documento como procesado', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_FACTURA_BASE });
    mockQueriesFacturaOk(d);
    d.xlinkMapeos.resolverProducto.mockResolvedValue(10);
    d.comprasSvc.create.mockResolvedValue({ id: 900, folio: 'COM-900', total: 118 });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    expect(resultados).toEqual([{ xlinkDocumentoId: 501, ok: true, yaExistia: false, documentoGeneradoId: 900, numeroGenerado: 'COM-900' }]);
    expect(d.comprasSvc.create).toHaveBeenCalledTimes(1);
    expect(d.comprasSvc.cambiarEstado).toHaveBeenCalledWith(900, 'recibida');
    expect(d.xlinkRepo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ estadoReceptor: XlinkEstadoReceptor.PROCESADO, documentoGeneradoId: 900, numeroGenerado: 'COM-900' }),
      d.manager,
    );
  });

  it('exige tipoGasto606 — sin él, rechaza antes de tocar nada', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_FACTURA_BASE });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501 }] }, USUARIO);

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/tipoGasto606/);
    expect(d.comprasSvc.create).not.toHaveBeenCalled();
  });

  it('sin proveedor vinculado, rechaza con mensaje claro', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_FACTURA_BASE });
    mockQueriesFacturaOk(d, { proveedor: null });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/vinculado/);
    expect(d.comprasSvc.create).not.toHaveBeenCalled();
  });

  it('ANTI-DUPLICADO: mismo RNC (proveedor) + mismo NCF ya registrado — NO crea otra compra', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_FACTURA_BASE });
    mockQueriesFacturaOk(d, { existente: { id: 777, folio: 'COM-777' } });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    expect(resultados[0]).toEqual({ xlinkDocumentoId: 501, ok: true, yaExistia: true, documentoGeneradoId: 777, numeroGenerado: 'COM-777' });
    expect(d.comprasSvc.create).not.toHaveBeenCalled();
    expect(d.xlinkRepo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ documentoGeneradoId: 777, estadoReceptor: XlinkEstadoReceptor.PROCESADO }),
      d.manager,
    );
  });

  it('DOBLE RECIBIR CONCURRENTE: si el documento ya no está pendiente (otra petición ya lo tomó), no crea una segunda compra', async () => {
    const d = buildDeps();
    // Simula que, para cuando esta petición adquirió el lock, la OTRA ya había comiteado el cambio a PROCESADO.
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({
      ...DOC_FACTURA_BASE, estadoReceptor: XlinkEstadoReceptor.PROCESADO, numeroGenerado: 'COM-900',
    });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/Ya se resolvió/);
    expect(d.comprasSvc.create).not.toHaveBeenCalled();
    expect(d.xlinkRepo.guardar).not.toHaveBeenCalled();
  });

  it('409: lista TODOS los faltantes de una vez (varias líneas sin mapear, no de una en una)', async () => {
    const d = buildDeps();
    const docDosLineas = {
      ...DOC_FACTURA_BASE,
      snapshot: {
        ...DOC_FACTURA_BASE.snapshot,
        lineas: [
          { sku: 'A1', nombre: 'Producto A', cantidad: 1, unidad: 'UND', precioUnitario: 100, descuento: 0, porcentajeIva: 18, montoItem: 100 },
          { sku: 'B2', nombre: 'Producto B', cantidad: 1, unidad: 'UND', precioUnitario: 50, descuento: 0, porcentajeIva: 18, montoItem: 50 },
        ],
      },
    };
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue(docDosLineas);
    mockQueriesFacturaOk(d);
    d.xlinkMapeos.resolverProducto.mockResolvedValue(null); // ninguna línea resuelve

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].faltantes).toEqual([
      { tipo: 'producto', valorExterno: 'A1', descripcion: 'Producto A', precioReferencia: 100 },
      { tipo: 'producto', valorExterno: 'B2', descripcion: 'Producto B', precioReferencia: 50 },
    ]);
    expect(d.comprasSvc.create).not.toHaveBeenCalled();
  });

  it('TASA DE ITBIS: 16% se envía como 16%, nunca se redondea/reasigna a 18%', async () => {
    const d = buildDeps();
    const doc16 = {
      ...DOC_FACTURA_BASE,
      snapshot: {
        ...DOC_FACTURA_BASE.snapshot,
        lineas: [{ sku: 'A1', nombre: 'Producto A', cantidad: 1, unidad: 'UND', precioUnitario: 100, descuento: 0, porcentajeIva: 16, montoItem: 100 }],
      },
    };
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue(doc16);
    mockQueriesFacturaOk(d);
    d.xlinkMapeos.resolverProducto.mockResolvedValue(10);
    d.comprasSvc.create.mockResolvedValue({ id: 901, folio: 'COM-901', total: 116 });

    await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    const dtoEnviado = d.comprasSvc.create.mock.calls[0][0];
    expect(dtoEnviado.detalles[0].porcentajeItbis).toBe(16);
  });

  it('rechaza una tasa de ITBIS no reconocida (ni la redondea, ni la deja pasar)', async () => {
    const d = buildDeps();
    const docTasaRara = {
      ...DOC_FACTURA_BASE,
      snapshot: {
        ...DOC_FACTURA_BASE.snapshot,
        lineas: [{ sku: 'A1', nombre: 'Producto A', cantidad: 1, unidad: 'UND', precioUnitario: 100, descuento: 0, porcentajeIva: 17.5, montoItem: 100 }],
      },
    };
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue(docTasaRara);
    mockQueriesFacturaOk(d);
    d.xlinkMapeos.resolverProducto.mockResolvedValue(10);

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/no es una tasa reconocida/);
    expect(d.comprasSvc.create).not.toHaveBeenCalled();
  });

  it('si el total de la compra creada no coincide con el de origen, la cancela y no deja nada a medias', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_FACTURA_BASE });
    mockQueriesFacturaOk(d);
    d.xlinkMapeos.resolverProducto.mockResolvedValue(10);
    d.comprasSvc.create.mockResolvedValue({ id: 902, folio: 'COM-902', total: 999.99 }); // no coincide con totalOrigen=118

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }] }, USUARIO);

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/no coincide/);
    expect(d.comprasSvc.cambiarEstado).toHaveBeenCalledWith(902, 'cancelada');
    expect(d.xlinkRepo.guardar).not.toHaveBeenCalled();
  });

  it('procesa cada item del lote de forma independiente', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino
      .mockResolvedValueOnce({ ...DOC_FACTURA_BASE, id: 501 })
      .mockResolvedValueOnce({ ...DOC_FACTURA_BASE, id: 502, estadoReceptor: XlinkEstadoReceptor.DESCARTADO });
    mockQueriesFacturaOk(d);
    d.xlinkMapeos.resolverProducto.mockResolvedValue(10);
    d.comprasSvc.create.mockResolvedValue({ id: 900, folio: 'COM-900', total: 118 });

    const resultados = await buildService(d).recibir(
      { items: [{ xlinkDocumentoId: 501, tipoGasto606: '02' }, { xlinkDocumentoId: 502, tipoGasto606: '02' }] },
      USUARIO,
    );

    expect(resultados[0].ok).toBe(true);
    expect(resultados[1].ok).toBe(false);
  });
});

describe('XlinkRecibirService.recibir — Orden de Compra → Cotización', () => {
  const DOC_OC = {
    id: 601, tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, origenEmpresaId: 3, destinoEmpresaId: EMPRESA,
    numeroOrigen: 'COM-5', ncfOrigen: null, totalOrigen: 118,
    estadoReceptor: XlinkEstadoReceptor.PENDIENTE,
    snapshot: {
      encabezado: { fechaOrigen: '2026-09-29', moneda: 'DOP', tipoCambio: 1, tipoPago: 'credito', diasCredito: 30 },
      lineas: [{ sku: null, nombre: 'Servicio sin SKU', cantidad: 1, unidad: 'UND', precioUnitario: 100, descuento: 0, porcentajeIva: 18, montoItem: 100 }],
    },
  };

  it('sin producto mapeado, NO bloquea — crea la Cotización con la línea sin productoId', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_OC });
    d.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM empresa WHERE id')) return Promise.resolve([{ xlinkId: 'xlink-origen' }]);
      if (sql.includes('FROM clientes')) return Promise.resolve([{ id: 33 }]);
      if (sql.includes('SELECT "nombreComercial", nombre FROM empresa')) return Promise.resolve([{ nombreComercial: 'Mi Empresa' }]);
      return Promise.resolve([]);
    });
    d.xlinkMapeos.resolverProducto.mockResolvedValue(null);
    d.cotizacionesSvc.create.mockResolvedValue({ id: 300, numero: 'COT-300' });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 601 }] }, USUARIO);

    expect(resultados[0]).toEqual({ xlinkDocumentoId: 601, ok: true, yaExistia: false, documentoGeneradoId: 300, numeroGenerado: 'COT-300' });
    const dtoEnviado = d.cotizacionesSvc.create.mock.calls[0][0];
    expect(dtoEnviado.detalles[0].productoId).toBeUndefined();
  });

  it('sin cliente vinculado, rechaza', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_OC });
    d.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM empresa WHERE id')) return Promise.resolve([{ xlinkId: 'xlink-origen' }]);
      if (sql.includes('FROM clientes')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 601 }] }, USUARIO);

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/cliente vinculado/);
  });
});

describe('XlinkRecibirService.recibir — Nota de Crédito → NotaCreditoCompra', () => {
  const DOC_NC = {
    id: 701, tipoDocumento: XlinkTipoDocumento.NOTA_CREDITO, origenEmpresaId: 3, destinoEmpresaId: EMPRESA,
    numeroOrigen: 'NC-8', ncfOrigen: 'E340000000001', totalOrigen: 59,
    estadoReceptor: XlinkEstadoReceptor.PENDIENTE,
    snapshot: {
      encabezado: { fechaOrigen: '2026-09-29', moneda: 'DOP', tipoCambio: 1, facturaOriginalId: 10 },
      lineas: [{ sku: 'A1', nombre: 'Producto A', cantidad: 1, unidad: 'UND', precioUnitario: 50, descuento: 0, porcentajeIva: 18, montoItem: 50 }],
    },
  };

  it('recibe y encadena con la Compra generada de la factura original, cuando existe el vínculo', async () => {
    const d = buildDeps();
    d.xlinkRepo.bloquearPorIdComoDestino.mockResolvedValue({ ...DOC_NC });
    d.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM empresa WHERE id')) return Promise.resolve([{ xlinkId: 'xlink-origen' }]);
      if (sql.includes('FROM proveedores')) return Promise.resolve([{ id: 55, sincronizarArticulosXlink: false }]);
      if (sql.includes('SELECT "nombreComercial", nombre FROM empresa')) return Promise.resolve([{ nombreComercial: 'Mi Empresa' }]);
      return Promise.resolve([]);
    });
    d.xlinkRepo.buscarPorOrigenComoDestino.mockResolvedValue({ documentoGeneradoId: 900, numeroGenerado: 'COM-900' });
    d.xlinkMapeos.resolverProducto.mockResolvedValue(10);
    d.nccSvc.crear.mockResolvedValue({ id: 400, numero: 'NCC-400', total: 59 });

    const resultados = await buildService(d).recibir({ items: [{ xlinkDocumentoId: 701 }] }, USUARIO);

    expect(resultados[0].ok).toBe(true);
    expect(d.nccSvc.crear).toHaveBeenCalledWith(
      expect.objectContaining({ compraOriginalId: 900, compraOriginalFolio: 'COM-900' }),
      USUARIO.id,
    );
    expect(d.nccSvc.recibir).toHaveBeenCalledWith(400);
  });
});
