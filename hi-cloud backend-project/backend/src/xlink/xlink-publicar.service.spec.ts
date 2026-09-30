import { XlinkPublicarService } from './xlink-publicar.service';
import { XlinkEstadoReceptor, XlinkTipoDocumento } from './entities/xlink-documento.entity';

const EMPRESA = 7;
const OTRA_XLINK_ID = '11111111-1111-1111-1111-111111111111';

function buildDeps() {
  return {
    ds: { query: jest.fn() },
    empresaRepo: { findOne: jest.fn().mockResolvedValue({ id: EMPRESA, rnc: '130000000', nombreComercial: 'Mi Empresa' }) },
    tenantSvc: { getEmpresaId: () => EMPRESA },
    auditoriaSvc: { registrar: jest.fn().mockResolvedValue(undefined) },
    notificacionesSvc: { notificarSistemaEmpresa: jest.fn().mockResolvedValue(undefined) },
    xlinkSvc: { assertPuedeUsarXlink: jest.fn().mockResolvedValue(undefined) },
    xlinkRepo: {
      existePorOrigen: jest.fn().mockResolvedValue(false),
      crear: jest.fn().mockResolvedValue({ id: 501 }),
      buscarPorDocumentoGeneradoComoDestino: jest.fn().mockResolvedValue(null),
      buscarPorIdComoOrigen: jest.fn(),
      buscarPorOrigenParaAnular: jest.fn(),
      guardar: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): XlinkPublicarService {
  return new XlinkPublicarService(
    d.ds as any, d.empresaRepo as any, d.tenantSvc as any,
    d.auditoriaSvc as any, d.notificacionesSvc as any, d.xlinkSvc as any, d.xlinkRepo as any,
  );
}

const FACTURA_ACEPTADA = {
  id: 10, folio: 'FAC-10', fecha: '2026-09-29', total: '118.00', estado: 'emitida', tipoPago: 'CREDITO',
  moneda: 'DOP', tipoCambio: '1', diasCredito: 30, fechaVencimiento: '2026-10-29',
  clienteId: 3, clienteNombre: 'Cliente X', xlinkEmpresaXlinkId: OTRA_XLINK_ID,
  ncfOrigen: 'E310000000001', estadoDGII: 'aceptado',
};
const LINEAS_FACTURA_CUADRADA = [
  { productoId: 1, descripcion: 'Producto A', cantidad: '1', precioUnitario: '100.00', descuento: '0', porcentajeIva: '18', montoItem: '100.00', itbis: '18.00', sku: 'A1', unidad: 'UND' },
];
const CONTRAPARTE_VISIBLE = { id: 99, isActive: true, xlinkVisible: true };

describe('XlinkPublicarService — resolverFactura vía publicar()', () => {
  function setupFacturaOk(dOverrides: Partial<typeof FACTURA_ACEPTADA> = {}) {
    const d = buildDeps();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) return Promise.resolve([{ ...FACTURA_ACEPTADA, ...dOverrides }]);
      if (sql.includes('FROM factura_detalles')) return Promise.resolve(LINEAS_FACTURA_CUADRADA);
      if (sql.includes('FROM cotizaciones')) return Promise.resolve([]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([CONTRAPARTE_VISIBLE]);
      return Promise.resolve([]);
    });
    return d;
  }

  it('publica correctamente una factura a crédito con e-CF aceptado y snapshot que cuadra', async () => {
    const d = setupFacturaOk();
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1, nombre: 'Ana' },
    );

    expect(resultados).toEqual([{ id: 10, ok: true }]);
    expect(d.xlinkRepo.crear).toHaveBeenCalledTimes(1);
    expect(d.auditoriaSvc.registrar).toHaveBeenCalledWith(expect.objectContaining({
      entidad: 'Factura', entidadId: '10', modulo: 'xlink',
    }));
    expect(d.notificacionesSvc.notificarSistemaEmpresa).toHaveBeenCalledWith(
      99, expect.any(String), expect.any(String), expect.any(String), '501',
    );
  });

  it('NO publica una factura con e-CF RECHAZADO', async () => {
    const d = setupFacturaOk({ estadoDGII: 'rechazado' } as any);
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/e-CF aceptado/);
    expect(d.xlinkRepo.crear).not.toHaveBeenCalled();
  });

  it('NO publica una factura sin ningún e-CF', async () => {
    const d = setupFacturaOk({ estadoDGII: null, ncfOrigen: null } as any);
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(d.xlinkRepo.crear).not.toHaveBeenCalled();
  });

  it('publica con e-CF OBSERVADO (aceptado condicional) — no lo rechaza', async () => {
    const d = setupFacturaOk({ estadoDGII: 'observado' } as any);
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(true);
  });

  it('NO publica una factura de CONTADO — solo a crédito', async () => {
    const d = setupFacturaOk({ tipoPago: 'CONTADO' } as any);
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/crédito/);
  });

  it('NO publica una factura anulada', async () => {
    const d = setupFacturaOk({ estado: 'cancelada' } as any);
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/anulada/);
  });

  it('NO publica un documento que NO CUADRA (suma de líneas ≠ total guardado)', async () => {
    const d = setupFacturaOk();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) return Promise.resolve([FACTURA_ACEPTADA]);
      if (sql.includes('FROM factura_detalles')) {
        // Línea dice 100+18=118, pero el total guardado es 118 en la factura...
        // forzamos un descuadre real: línea que suma solo 90+16.2=106.2
        return Promise.resolve([{ ...LINEAS_FACTURA_CUADRADA[0], montoItem: '90.00', itbis: '16.20' }]);
      }
      if (sql.includes('FROM cotizaciones')) return Promise.resolve([]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([CONTRAPARTE_VISIBLE]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/no cuadra/);
    expect(d.xlinkRepo.crear).not.toHaveBeenCalled();
  });

  it('NO publica si el cliente no está vinculado a ninguna empresa Xlink', async () => {
    const d = setupFacturaOk({ xlinkEmpresaXlinkId: null } as any);
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toContain('Cliente X');
  });

  it('NO publica si la contraparte ya no está visible', async () => {
    const d = setupFacturaOk();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) return Promise.resolve([FACTURA_ACEPTADA]);
      if (sql.includes('FROM factura_detalles')) return Promise.resolve(LINEAS_FACTURA_CUADRADA);
      if (sql.includes('FROM cotizaciones')) return Promise.resolve([]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([{ id: 99, isActive: true, xlinkVisible: false }]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
  });

  it('NO publica hacia la propia empresa', async () => {
    const d = setupFacturaOk();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) return Promise.resolve([FACTURA_ACEPTADA]);
      if (sql.includes('FROM factura_detalles')) return Promise.resolve(LINEAS_FACTURA_CUADRADA);
      if (sql.includes('FROM cotizaciones')) return Promise.resolve([]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([{ id: EMPRESA, isActive: true, xlinkVisible: true }]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/propia empresa/);
  });

  it('rechaza republicar un documento ya publicado', async () => {
    const d = setupFacturaOk();
    d.xlinkRepo.existePorOrigen.mockResolvedValue(true);
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] },
      { id: 1 },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/ya fue publicado/);
    expect(d.xlinkRepo.crear).not.toHaveBeenCalled();
  });

  it('encadena xlinkPadreId cuando la factura nació de una Cotización recibida por Xlink', async () => {
    const d = setupFacturaOk();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) return Promise.resolve([FACTURA_ACEPTADA]);
      if (sql.includes('FROM factura_detalles')) return Promise.resolve(LINEAS_FACTURA_CUADRADA);
      if (sql.includes('FROM cotizaciones')) return Promise.resolve([{ id: 55 }]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([CONTRAPARTE_VISIBLE]);
      return Promise.resolve([]);
    });
    d.xlinkRepo.buscarPorDocumentoGeneradoComoDestino.mockResolvedValue({ id: 777 });
    const service = buildService(d);

    await service.publicar({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10] }, { id: 1 });

    expect(d.xlinkRepo.buscarPorDocumentoGeneradoComoDestino).toHaveBeenCalledWith('cotizacion', 55);
    expect(d.xlinkRepo.crear).toHaveBeenCalledWith(expect.objectContaining({ xlinkPadreId: 777 }));
  });

  it('procesa cada documento del lote de forma independiente — uno falla, los demás no', async () => {
    const d = buildDeps();
    let llamada = 0;
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) {
        llamada++;
        // La primera (id 10) rechazada; la segunda (id 20) aceptada
        return Promise.resolve([{ ...FACTURA_ACEPTADA, id: llamada === 1 ? 10 : 20, folio: llamada === 1 ? 'FAC-10' : 'FAC-20', estadoDGII: llamada === 1 ? 'rechazado' : 'aceptado' }]);
      }
      if (sql.includes('FROM factura_detalles')) return Promise.resolve(LINEAS_FACTURA_CUADRADA);
      if (sql.includes('FROM cotizaciones')) return Promise.resolve([]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([CONTRAPARTE_VISIBLE]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [10, 20] },
      { id: 1 },
    );

    expect(resultados).toEqual([
      { id: 10, ok: false, error: expect.any(String) },
      { id: 20, ok: true },
    ]);
  });
});

describe('XlinkPublicarService.eliminarEnviado', () => {
  it('elimina (desactiva) un envío pendiente', async () => {
    const d = buildDeps();
    d.xlinkRepo.buscarPorIdComoOrigen.mockResolvedValue({ id: 501, estadoReceptor: XlinkEstadoReceptor.PENDIENTE, isActive: true });
    const service = buildService(d);

    await service.eliminarEnviado(501);

    expect(d.xlinkRepo.guardar).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it('rechaza eliminar un envío ya procesado por el receptor', async () => {
    const d = buildDeps();
    d.xlinkRepo.buscarPorIdComoOrigen.mockResolvedValue({ id: 501, estadoReceptor: XlinkEstadoReceptor.PROCESADO });
    const service = buildService(d);

    await expect(service.eliminarEnviado(501)).rejects.toThrow(/ya lo procesó/);
    expect(d.xlinkRepo.guardar).not.toHaveBeenCalled();
  });

  it('rechaza si el documento no existe o no es propio', async () => {
    const d = buildDeps();
    d.xlinkRepo.buscarPorIdComoOrigen.mockResolvedValue(null);
    const service = buildService(d);

    await expect(service.eliminarEnviado(999)).rejects.toThrow();
  });
});

describe('XlinkPublicarService.notificarAnulacionEnOrigen — gancho TIPO B', () => {
  it('documento pendiente → pasa a anulado_en_origen', async () => {
    const d = buildDeps();
    const doc = { id: 501, estadoReceptor: XlinkEstadoReceptor.PENDIENTE, destinoEmpresaId: 99, numeroOrigen: 'FAC-10' };
    d.xlinkRepo.buscarPorOrigenParaAnular.mockResolvedValue(doc);
    const service = buildService(d);

    await service.notificarAnulacionEnOrigen(XlinkTipoDocumento.FACTURA_CREDITO, 10);

    expect(d.xlinkRepo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ estadoReceptor: XlinkEstadoReceptor.ANULADO_EN_ORIGEN }),
    );
    expect(d.notificacionesSvc.notificarSistemaEmpresa).not.toHaveBeenCalled();
  });

  it('documento ya procesado → notifica al receptor, NO toca su compra/documento generado', async () => {
    const d = buildDeps();
    const doc = { id: 501, estadoReceptor: XlinkEstadoReceptor.PROCESADO, destinoEmpresaId: 99, numeroOrigen: 'FAC-10' };
    d.xlinkRepo.buscarPorOrigenParaAnular.mockResolvedValue(doc);
    const service = buildService(d);

    await service.notificarAnulacionEnOrigen(XlinkTipoDocumento.FACTURA_CREDITO, 10);

    expect(d.xlinkRepo.guardar).not.toHaveBeenCalled();
    expect(d.notificacionesSvc.notificarSistemaEmpresa).toHaveBeenCalledWith(
      99, expect.any(String), expect.any(String), expect.any(String), '501',
    );
  });

  it('documento nunca publicado → no-op, no lanza', async () => {
    const d = buildDeps();
    d.xlinkRepo.buscarPorOrigenParaAnular.mockResolvedValue(null);
    const service = buildService(d);

    await expect(service.notificarAnulacionEnOrigen(XlinkTipoDocumento.FACTURA_CREDITO, 10)).resolves.toBeUndefined();
    expect(d.xlinkRepo.guardar).not.toHaveBeenCalled();
    expect(d.notificacionesSvc.notificarSistemaEmpresa).not.toHaveBeenCalled();
  });
});
