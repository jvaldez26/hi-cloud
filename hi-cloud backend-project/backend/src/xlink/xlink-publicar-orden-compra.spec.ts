import { XlinkPublicarService } from './xlink-publicar.service';
import { XlinkTipoDocumento } from './entities/xlink-documento.entity';

/**
 * Publicar una Orden de Compra por HiCloud Xlink — sin cobertura hasta
 * ahora (solo había tests de Factura). Cubre en particular la Fase 2d de
 * la auditoría (2026-10-03): la documentación siempre dijo "la OC tiene
 * que estar en estado Enviada y tener término de pago", pero tipoPago es
 * NULLABLE en compras (create-compra.dto.ts) y nunca se validaba de
 * verdad al publicar.
 */
const EMPRESA = 7;
const OTRA_XLINK_ID = '22222222-2222-2222-2222-222222222222';
const CONTRAPARTE_VISIBLE = { id: 88, isActive: true, xlinkVisible: true };

const OC_OK = {
  id: 50, folio: 'COM-50', fecha: '2026-10-01', total: '236.00', estado: 'enviada', tipoPago: 'credito',
  moneda: 'DOP', tipoCambio: '1', diasCredito: 30, fechaVencimiento: '2026-10-31',
  proveedorId: 5, proveedorNombre: 'Proveedor X', xlinkEmpresaXlinkId: OTRA_XLINK_ID,
};
const LINEAS_OC_CUADRADA = [
  { productoId: 1, descripcion: 'Producto A', cantidad: '1', precioUnitario: '200.00', descuento: '0', porcentajeIva: '18', montoItem: '200.00', itbis: '36.00', sku: 'A1', unidad: 'UND', productoEmpresaId: 1 },
];

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
      crear: jest.fn().mockResolvedValue({ id: 601 }),
      buscarPorDocumentoGeneradoComoDestino: jest.fn().mockResolvedValue(null),
    },
    realtimeSvc: { notify: jest.fn() },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): XlinkPublicarService {
  return new XlinkPublicarService(
    d.ds as any, d.empresaRepo as any, d.tenantSvc as any,
    d.auditoriaSvc as any, d.notificacionesSvc as any, d.xlinkSvc as any, d.xlinkRepo as any,
    d.realtimeSvc as any,
  );
}

function setupOc(overrides: Partial<typeof OC_OK> = {}) {
  const d = buildDeps();
  d.ds.query.mockImplementation((sql: string) => {
    if (sql.includes('FROM compras')) return Promise.resolve([{ ...OC_OK, ...overrides }]);
    if (sql.includes('FROM compra_detalles')) return Promise.resolve(LINEAS_OC_CUADRADA);
    if (sql.includes('FROM empresa WHERE "xlinkId"')) return Promise.resolve([CONTRAPARTE_VISIBLE]);
    return Promise.resolve([]);
  });
  return d;
}

describe('XlinkPublicarService — resolverOrdenCompra vía publicar()', () => {
  it('publica una OC en "enviada" con término de pago — camino feliz', async () => {
    const d = setupOc();
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [50] },
      { id: 1, nombre: 'Ana' },
    );

    expect(resultados).toEqual([{ id: 50, ok: true }]);
    expect(d.xlinkRepo.crear).toHaveBeenCalledTimes(1);
  });

  it('sin tipoPago (NULL): rechaza — "no tiene término de pago"', async () => {
    const d = setupOc({ tipoPago: null as any });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [50] },
      { id: 1, nombre: 'Ana' },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/término de pago/i);
    expect(d.xlinkRepo.crear).not.toHaveBeenCalled();
  });

  it('tipoPago = "contado" (no solo crédito): sí es un término de pago válido', async () => {
    const d = setupOc({ tipoPago: 'contado' });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [50] },
      { id: 1, nombre: 'Ana' },
    );

    expect(resultados[0].ok).toBe(true);
  });

  it('estado distinto de "enviada": rechaza (aunque tenga término de pago)', async () => {
    const d = setupOc({ estado: 'recibida' });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [50] },
      { id: 1, nombre: 'Ana' },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/estado "enviada"/);
  });

  it('OC cancelada: rechaza', async () => {
    const d = setupOc({ estado: 'cancelada' });
    const service = buildService(d);

    const resultados = await service.publicar(
      { tipoDocumento: XlinkTipoDocumento.ORDEN_COMPRA, documentoIds: [50] },
      { id: 1, nombre: 'Ana' },
    );

    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].error).toMatch(/anulada/);
  });
});
