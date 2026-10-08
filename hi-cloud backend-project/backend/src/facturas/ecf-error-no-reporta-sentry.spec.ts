/**
 * Sentry #7779557844: un EcfError (EcfDuplicadoError, EcfValidacionError,
 * etc.) es un 422 de negocio esperado, no un fallo de infraestructura —
 * mismo criterio que instrument.ts/SKIP_EXCEPTION_TYPES y
 * http-exception.filter.ts. Antes de este fix, cambiarEstado() llamaba a
 * reportServiceError para CUALQUIER error que emitirECFUseCase.execute()
 * lanzara, sin mirar el tipo — así que hasta un EcfDuplicadoError (la MISMA
 * venta en curso, no un fallo) llegaba a Sentry como error. Esta prueba fija
 * que un EcfError nunca llama a reportServiceError, en los dos caminos (POS
 * síncrono y non-POS fire-and-forget), mientras que un error real
 * (infraestructura) sigue reportándose igual que antes.
 */
import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';
import { EcfDuplicadoError } from '../ecf/errors/ecf.errors';

const reportServiceError = jest.fn();
jest.mock('../common/observability/sentry', () => ({
  reportServiceError: (...args: unknown[]) => reportServiceError(...args),
  reportServerError:  jest.fn(),
}));

const FACTURA = {
  id: 1, empresaId: 42, estado: FacturaEstado.BORRADOR, usuarioId: 5,
  vendedorId: 10, nombreVendedor: 'Juan', tipoPago: 'CONTADO',
  formasPago: [{ tipo: 1, monto: 100 }],
  detalles: [], notas: '', fecha: new Date('2026-09-19'),
  total: 100, subtotal: 100, iva: 0, tipoNcf: 'E32', folio: 'FAC-15227',
};

function makeService(errorDeEmision: Error) {
  const facturaRepository: any = {
    findOne: jest.fn().mockResolvedValue({ ...FACTURA }),
    update:  jest.fn().mockResolvedValue({}),
    manager: {
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: () => ({
        select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ getRawOne: jest.fn().mockResolvedValue(null) }) }) }) }) }),
      }),
    },
  };
  const svc: any = Object.create(FacturasService.prototype);
  svc.logger              = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.facturaRepository   = facturaRepository;
  svc.tenantService       = { getUserId: () => 5, getAlmacenId: () => undefined, getEmpresaId: () => 42 };
  svc.cajaService         = { esCajaAbiertaVendedor: jest.fn().mockResolvedValue({ ok: true }) };
  svc.limitesService      = { verificarLimiteIngresos: jest.fn().mockResolvedValue(undefined), actualizarCacheIngresos: jest.fn().mockResolvedValue(undefined) };
  svc.asientosService     = { asientoFacturaEmitida: jest.fn().mockResolvedValue(undefined) };
  svc.emitirECFUseCase    = { execute: jest.fn().mockRejectedValue(errorDeEmision) };
  svc.realtimeService     = { notify: jest.fn() };
  svc.rncService          = { consultarRNC: jest.fn() };
  svc.vendedorResolver    = { resolverVendedor: jest.fn() };
  svc.inventarioService   = { registrarSalida: jest.fn() };
  svc.cxcService          = { crear: jest.fn() };
  // pg_advisory_xact_lock — el candado de emitir-pos-concurrencia.spec.ts.
  // Sin carrera que probar aquí: el manager siempre ve BORRADOR.
  svc.dataSource          = {
    query: jest.fn().mockResolvedValue([]),
    transaction: (cb: (m: unknown) => Promise<unknown>) => cb({
      query: jest.fn().mockResolvedValue([{ estado: FacturaEstado.BORRADOR }]),
      getRepository: () => facturaRepository,
    }),
  };
  svc.facturaEmail        = { enviar: jest.fn().mockResolvedValue(undefined) };
  svc.verificarRastroCobro = jest.fn().mockResolvedValue(undefined);

  return { svc: svc as FacturasService };
}

describe('cambiarEstado() — reportServiceError y la familia EcfError', () => {
  beforeEach(() => reportServiceError.mockClear());

  it('non-POS: EcfDuplicadoError NO reporta a Sentry', async () => {
    const { svc } = makeService(new EcfDuplicadoError('E320000000001', 'pendiente_envio', 1));

    await (svc as any).cambiarEstado(1, FacturaEstado.EMITIDA, false);
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);

    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('non-POS: un error real (infraestructura, no EcfError) SÍ sigue reportando — esto no se volvió silencioso', async () => {
    const { svc } = makeService(new Error('ECONNREFUSED'));

    await (svc as any).cambiarEstado(1, FacturaEstado.EMITIDA, false);
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);

    expect(reportServiceError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ECONNREFUSED' }),
      'ecf_non_pos',
      expect.anything(),
    );
  });

  it('POS síncrono: EcfDuplicadoError NO reporta a Sentry', async () => {
    const { svc } = makeService(new EcfDuplicadoError('E320000000001', 'pendiente_envio', 1));

    await (svc as any).cambiarEstado(1, FacturaEstado.EMITIDA, true);

    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('POS síncrono: un error real SÍ sigue reportando', async () => {
    const { svc } = makeService(new Error('ECONNREFUSED'));

    await (svc as any).cambiarEstado(1, FacturaEstado.EMITIDA, true);

    expect(reportServiceError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ECONNREFUSED' }),
      'ecf_pos_sincrono',
      expect.anything(),
    );
  });
});
