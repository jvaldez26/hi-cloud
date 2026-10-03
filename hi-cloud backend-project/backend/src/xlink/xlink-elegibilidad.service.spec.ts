import { XlinkElegibilidadService } from './xlink-elegibilidad.service';
import { XlinkTipoDocumento, XlinkEstadoReceptor } from './entities/xlink-documento.entity';

/**
 * Estado Xlink en lote (Fase 2a, auditoría HiCloud Xlink 2026-10-03): la
 * MISMA heurística de elegibilidad que antes solo existía como un `boolean`
 * inline en FacturaDetailPage.tsx (`tipoPago === 'CREDITO'`), ahora
 * centralizada y con motivo concreto — para los 3 tipos de documento, en
 * una sola consulta por lote.
 */
const EMPRESA = 7;
const XLINK_ID = '33333333-3333-3333-3333-333333333333';

function buildDeps() {
  return {
    ds: { query: jest.fn().mockResolvedValue([]) },
    empresaRepo: { findOne: jest.fn().mockResolvedValue({ id: EMPRESA, xlinkVisible: true }) },
    tenantSvc: { getEmpresaId: () => EMPRESA },
    xlinkRepo: { buscarEstadosPorOrigenes: jest.fn().mockResolvedValue(new Map()) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): XlinkElegibilidadService {
  return new XlinkElegibilidadService(d.ds as any, d.empresaRepo as any, d.tenantSvc as any, d.xlinkRepo as any);
}

describe('XlinkElegibilidadService.estadoDeDocumentos — factura a crédito', () => {
  function mockFactura(d: ReturnType<typeof buildDeps>, overrides: Record<string, unknown> = {}) {
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) {
        return Promise.resolve([{
          id: 1, estado: 'emitida', tipoPago: 'CREDITO', estadoDGII: 'aceptado',
          xlinkEmpresaXlinkId: XLINK_ID, clienteNombre: 'Cliente X',
          ...overrides,
        }]);
      }
      if (sql.includes('FROM empresa WHERE "xlinkId"')) {
        return Promise.resolve([{ xlinkId: XLINK_ID, isActive: true, xlinkVisible: true }]);
      }
      return Promise.resolve([]);
    });
  }

  it('todo en regla: elegible, sin motivo', async () => {
    const d = buildDeps();
    mockFactura(d);
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r).toEqual({ id: 1, yaEnviado: false, elegible: true, motivo: undefined });
  });

  it('mi empresa no está activada en Xlink: motivo "Active HiCloud Xlink para su empresa" — se revisa ANTES que cualquier otra cosa', async () => {
    const d = buildDeps();
    d.empresaRepo.findOne.mockResolvedValue({ id: EMPRESA, xlinkVisible: false });
    mockFactura(d);
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r.elegible).toBe(false);
    expect(r.motivo).toBe('Active HiCloud Xlink para su empresa');
  });

  it('no es a crédito: motivo específico', async () => {
    const d = buildDeps();
    mockFactura(d, { tipoPago: 'CONTADO' });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r.motivo).toBe('Solo se pueden enviar facturas a crédito');
  });

  it('e-CF no aceptado: motivo específico', async () => {
    const d = buildDeps();
    mockFactura(d, { estadoDGII: 'rechazado' });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r.motivo).toBe('El e-CF debe estar aceptado por DGII');
  });

  it('e-CF observado: SÍ es elegible (aceptado con observaciones cuenta)', async () => {
    const d = buildDeps();
    mockFactura(d, { estadoDGII: 'observado' });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r.elegible).toBe(true);
  });

  it('cliente no vinculado: motivo nombra al cliente', async () => {
    const d = buildDeps();
    mockFactura(d, { xlinkEmpresaXlinkId: null });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r.motivo).toBe('El cliente "Cliente X" no está vinculado en HiCloud Xlink');
  });

  it('contraparte ya no visible: motivo específico', async () => {
    const d = buildDeps();
    mockFactura(d);
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) return Promise.resolve([{ id: 1, estado: 'emitida', tipoPago: 'CREDITO', estadoDGII: 'aceptado', xlinkEmpresaXlinkId: XLINK_ID, clienteNombre: 'Cliente X' }]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([{ xlinkId: XLINK_ID, isActive: true, xlinkVisible: false }]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r.motivo).toMatch(/ya no está visible/);
  });

  it('factura cancelada: motivo "anulado"', async () => {
    const d = buildDeps();
    mockFactura(d, { estado: 'cancelada' });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r.motivo).toBe('El documento está anulado');
  });

  it('ya enviado: yaEnviado=true, elegible=false, trae estadoReceptor y numeroGenerado (ignora cualquier dato de negocio que haya)', async () => {
    const d = buildDeps();
    d.xlinkRepo.buscarEstadosPorOrigenes.mockResolvedValue(
      new Map([[1, { estadoReceptor: XlinkEstadoReceptor.PROCESADO, numeroGenerado: 'COM-55' }]]),
    );
    mockFactura(d); // aunque la factura en sí esté "en regla", yaEnviado manda
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1] });

    expect(r).toEqual({ id: 1, yaEnviado: true, estadoReceptor: XlinkEstadoReceptor.PROCESADO, numeroGenerado: 'COM-55', elegible: false, motivo: 'Ya enviado' });
  });
});

describe('XlinkElegibilidadService.estadoDeDocumentos — Orden de Compra', () => {
  it('estado distinto de "enviada": motivo específico', async () => {
    const d = buildDeps();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM compras')) return Promise.resolve([{ id: 1, estado: 'recibida', tipoPago: 'credito', xlinkEmpresaXlinkId: XLINK_ID, proveedorNombre: 'Prov X' }]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([{ xlinkId: XLINK_ID, isActive: true, xlinkVisible: true }]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [1] });

    expect(r.motivo).toBe('La orden debe estar en estado Enviada');
  });

  it('sin término de pago: motivo específico', async () => {
    const d = buildDeps();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM compras')) return Promise.resolve([{ id: 1, estado: 'enviada', tipoPago: null, xlinkEmpresaXlinkId: XLINK_ID, proveedorNombre: 'Prov X' }]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([{ xlinkId: XLINK_ID, isActive: true, xlinkVisible: true }]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [1] });

    expect(r.motivo).toBe('Falta el término de pago');
  });

  it('enviada + con término de pago + proveedor vinculado: elegible (la OC no exige e-CF ni "a crédito")', async () => {
    const d = buildDeps();
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM compras')) return Promise.resolve([{ id: 1, estado: 'enviada', tipoPago: 'contado', xlinkEmpresaXlinkId: XLINK_ID, proveedorNombre: 'Prov X' }]);
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([{ xlinkId: XLINK_ID, isActive: true, xlinkVisible: true }]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const [r] = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [1] });

    expect(r.elegible).toBe(true);
  });
});

describe('XlinkElegibilidadService.estadoDeDocumentos — mezcla de varios documentos en un solo lote', () => {
  it('cada id se resuelve de forma independiente (uno elegible, uno no, uno ya enviado)', async () => {
    const d = buildDeps();
    d.xlinkRepo.buscarEstadosPorOrigenes.mockResolvedValue(
      new Map([[3, { estadoReceptor: XlinkEstadoReceptor.PENDIENTE, numeroGenerado: undefined }]]),
    );
    d.ds.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas')) {
        return Promise.resolve([
          { id: 1, estado: 'emitida', tipoPago: 'CREDITO', estadoDGII: 'aceptado', xlinkEmpresaXlinkId: XLINK_ID, clienteNombre: 'Cliente X' },
          { id: 2, estado: 'emitida', tipoPago: 'CONTADO', estadoDGII: 'aceptado', xlinkEmpresaXlinkId: XLINK_ID, clienteNombre: 'Cliente Y' },
        ]);
      }
      if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([{ xlinkId: XLINK_ID, isActive: true, xlinkVisible: true }]);
      return Promise.resolve([]);
    });
    const service = buildService(d);

    const resultados = await service.estadoDeDocumentos({ tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoIds: [1, 2, 3] });

    expect(resultados.find(r => r.id === 1)).toMatchObject({ elegible: true });
    expect(resultados.find(r => r.id === 2)).toMatchObject({ elegible: false, motivo: 'Solo se pueden enviar facturas a crédito' });
    expect(resultados.find(r => r.id === 3)).toMatchObject({ yaEnviado: true, elegible: false });
  });
});
