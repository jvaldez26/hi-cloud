/**
 * Fix urgente — Sentry #7742858869 y Bloque 4 del reporte: "el 200 que no
 * era 200". PATCH /facturas/:id/estado (modoSincrono=false) responde 200
 * de inmediato — la emisión del e-CF es fire-and-forget (ver comentario en
 * cambiarEstado()) — así que si MSeller/la emisión falla DESPUÉS de que la
 * respuesta ya salió, el único canal que le queda al usuario es el
 * realtime: el frontend ya escucha 'factura'/'updated' e invalida la lista
 * (useRealtime.ts), y FacturasPage ya sabe pintar el badge de
 * RECHAZADO/PENDIENTE_ENVIO con su botón de reenviar. Antes de este fix el
 * .catch() de la emisión async NO llamaba a notify() — solo lo hacía el
 * camino de éxito — así que la factura se veía "normal" hasta que alguien
 * la abriera a mano o el fallo apareciera en Sentry.
 */

import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';

const FACTURA = {
  id: 1, empresaId: 42, estado: FacturaEstado.BORRADOR, usuarioId: 5,
  vendedorId: 10, nombreVendedor: 'Juan', tipoPago: 'CONTADO',
  detalles: [], notas: '', fecha: new Date('2026-09-19'),
  total: 100, subtotal: 100, iva: 0, tipoNcf: 'E32', folio: 'FAC-15227',
};

function makeService() {
  const facturaRepository: any = {
    findOne: jest.fn().mockResolvedValue({ ...FACTURA }),
    update:  jest.fn().mockResolvedValue({}),
    manager: {
      query: jest.fn().mockResolvedValue([]), // sin ecf previo — findOne() interno
      createQueryBuilder: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({ getRawOne: jest.fn().mockResolvedValue(null) }),
              }),
            }),
          }),
        }),
      }),
    },
  };
  const tenantService    = { getUserId: () => 5, getAlmacenId: () => undefined, getEmpresaId: () => 42 };
  const cajaService       = { esCajaAbiertaVendedor: jest.fn().mockResolvedValue({ ok: true }) };
  const limitesService    = { verificarLimiteIngresos: jest.fn().mockResolvedValue(undefined), actualizarCacheIngresos: jest.fn().mockResolvedValue(undefined) };
  const asientosService   = { asientoFacturaEmitida: jest.fn().mockResolvedValue(undefined) };
  const emitirECFUseCase  = { execute: jest.fn().mockRejectedValue(new Error('MSeller no disponible')) };
  const realtimeService   = { notify: jest.fn() };
  const rncService        = { consultarRNC: jest.fn() };

  const svc: any = Object.create(FacturasService.prototype);
  svc.logger              = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.facturaRepository   = facturaRepository;
  svc.tenantService       = tenantService;
  svc.cajaService         = cajaService;
  svc.limitesService      = limitesService;
  svc.asientosService     = asientosService;
  svc.emitirECFUseCase    = emitirECFUseCase;
  svc.realtimeService     = realtimeService;
  svc.rncService          = rncService;
  svc.vendedorResolver    = { resolverVendedor: jest.fn() };
  svc.inventarioService   = { registrarSalida: jest.fn() };
  svc.cxcService          = { crear: jest.fn() };
  svc.dataSource          = { query: jest.fn().mockResolvedValue([]) };
  svc.facturaEmail        = { enviar: jest.fn().mockResolvedValue(undefined) };

  return { svc: svc as FacturasService, realtimeService, emitirECFUseCase };
}

describe('FacturasService.cambiarEstado() — emisión non-POS fallida notifica por realtime', () => {
  it('cuando la emisión del e-CF falla en segundo plano, llama a realtimeService.notify igual que el camino de éxito', async () => {
    const { svc, realtimeService, emitirECFUseCase } = makeService();

    await (svc as any).cambiarEstado(1, FacturaEstado.EMITIDA, false);
    // La emisión es fire-and-forget: esperar a que el microtask del .catch() corra.
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);

    expect(emitirECFUseCase.execute).toHaveBeenCalled();
    expect(realtimeService.notify).toHaveBeenCalledWith(42, 'factura', 'updated', 1);
  });
});
