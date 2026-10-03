import { ComprasService } from './compras.service';

/**
 * previsualizarAsiento() con líneas incompletas (bug real: ELIDO SEPULVEDA,
 * 2026-10-03 — ver dto/precio-unitario-decimales.spec.ts para el detalle
 * completo). El frontend llama este endpoint con debounce mientras el
 * usuario sigue escribiendo; una línea sin precioUnitario (o cantidad)
 * todavía NO debe tumbar el preview con un 400 — se ignora en vez de
 * rechazar toda la llamada.
 */
const PROD_ID = 10;

function buildDeps() {
  return {
    compraRepo: { findOne: jest.fn(), update: jest.fn() },
    detalleRepo: { update: jest.fn() },
    productosService: {
      findByIds: jest.fn().mockResolvedValue(new Map([[PROD_ID, { id: PROD_ID, nombre: 'Producto Test' }]])),
    },
    inventarioSvc: { registrarEntrada: jest.fn(), registrarDevolucion: jest.fn() },
    valoracionSvc: { actualizarCostoPromedio: jest.fn() },
    cxpSvc: { crear: jest.fn() },
    asientosSvc: {
      asientoCompraRecibida: jest.fn(),
      previsualizarCompra:   jest.fn().mockResolvedValue({ ok: true, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: true }),
    },
    tenantSvc: { getEmpresaId: () => 1, getAlmacenId: () => null, getSucursalId: () => null, resolveSucursalId: jest.fn() },
    realtimeSvc: { notify: jest.fn() },
    gastosImportacionSvc: { getCostosImportacionPorUnidad: jest.fn().mockResolvedValue(new Map()), aplicarGastosPendientes: jest.fn() },
    ds: { query: jest.fn().mockResolvedValue([]) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): ComprasService {
  return new ComprasService(
    d.compraRepo as any, d.detalleRepo as any,
    {} as any, d.productosService as any,
    { registrarDesdeCompra: jest.fn() } as any,
    d.inventarioSvc as any, d.valoracionSvc as any, d.cxpSvc as any,
    d.asientosSvc as any, d.tenantSvc as any, d.realtimeSvc as any,
    d.gastosImportacionSvc as any, d.ds as any,
    { notificarAnulacionEnOrigen: jest.fn() } as any,
  );
}

describe('ComprasService.previsualizarAsiento — líneas incompletas (no 400, se ignoran)', () => {
  it('línea sin precioUnitario: se ignora, preview en cero, NUNCA lanza', async () => {
    const d = buildDeps();
    const service = buildService(d);

    const resultado = await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-10-03',
      detalles: [{ productoId: PROD_ID, cantidad: 5 } as any],
    } as any);

    expect(resultado).toBeDefined();
    expect(d.productosService.findByIds).not.toHaveBeenCalled(); // calcularDetalles() nunca corrió
    expect(d.asientosSvc.previsualizarCompra).toHaveBeenCalledWith(0, 0, 0, 'OC-VISTA-PREVIA', undefined, undefined);
  });

  it('precioUnitario llega como NaN (p.ej. texto no numérico ya convertido por el DTO): se ignora igual', async () => {
    const d = buildDeps();
    const service = buildService(d);

    const resultado = await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-10-03',
      detalles: [{ productoId: PROD_ID, cantidad: 5, precioUnitario: NaN } as any],
    } as any);

    expect(resultado).toBeDefined();
    expect(d.productosService.findByIds).not.toHaveBeenCalled();
  });

  it('línea sin cantidad (ni bonificada): se ignora igual', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-10-03',
      detalles: [{ productoId: PROD_ID, precioUnitario: 100 } as any],
    } as any);

    expect(d.productosService.findByIds).not.toHaveBeenCalled();
  });

  it('sin detalles del todo (undefined): preview en cero, no lanza', async () => {
    const d = buildDeps();
    const service = buildService(d);

    const resultado = await service.previsualizarAsiento({ proveedorId: 1, fecha: '2026-10-03' } as any);

    expect(resultado).toBeDefined();
    expect(d.asientosSvc.previsualizarCompra).toHaveBeenCalledWith(0, 0, 0, 'OC-VISTA-PREVIA', undefined, undefined);
  });

  it('mezcla de una línea completa y una incompleta: SOLO calcula con la completa', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-10-03',
      detalles: [
        { productoId: PROD_ID, cantidad: 5, precioUnitario: 100, porcentajeItbis: 18 },
        { productoId: PROD_ID, cantidad: 3 } as any, // incompleta — sin precioUnitario
      ],
    } as any);

    // 5 × 100 = 500 subtotal, 90 ITBIS — SOLO la línea completa cuenta
    expect(d.asientosSvc.previsualizarCompra).toHaveBeenCalledWith(590, 500, 90, 'OC-VISTA-PREVIA', undefined, undefined);
  });

  it('precioUnitario con 4 decimales (precio "sin ITBIS" calculado): se previsualiza sin error', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-10-03',
      detalles: [{ productoId: PROD_ID, cantidad: 1, precioUnitario: 84.7458, porcentajeItbis: 18 }],
    } as any);

    // 1 × 84.7458 redondeado a 2 decimales = 84.75 (importeBruto), ITBIS 18% = 15.25, total 100.
    expect(d.asientosSvc.previsualizarCompra).toHaveBeenCalledWith(100, 84.75, 15.25, 'OC-VISTA-PREVIA', undefined, undefined);
  });
});
