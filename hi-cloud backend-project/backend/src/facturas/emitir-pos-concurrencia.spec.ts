/**
 * Verificación pedida tras el fix de Sentry #7779557844: el guard
 * EMITIDA→EMITIDA basado en una lectura SIN lock (ver emitir-pos-en-curso.spec.ts)
 * solo protege si la PRIMERA petición ya alcanzó a escribir estado=EMITIDA
 * cuando la segunda hace su propio `findOne(id)`. Si las dos leen BORRADOR
 * casi al mismo tiempo (la ventana real: cualquier paso lento ANTES de esa
 * escritura — RNC, inventario, caja, límites...), ninguna ve a la otra y
 * ambas siguen de largo por TODO el resto de cambiarEstado.
 *
 * Confirmado (2026-10-07): con el guard sin lock, este test fallaba —
 * inventario/CxC/asiento/e-CF corrían 2 veces. El fix real es
 * pg_advisory_xact_lock(id) alrededor de TODO el bloque de guards+efectos,
 * liberado ANTES de llamar a MSeller. Este archivo simula ese lock con una
 * cola FIFO (misma semántica: la segunda transacción no empieza a correr su
 * callback hasta que la primera termina el suyo — exactamente cómo Postgres
 * bloquea un segundo `pg_advisory_xact_lock` del mismo id hasta el commit).
 *
 * Nota sobre el conteo de `emitirECFUseCase.execute` que verifica este test:
 * aquí ESE conteo pasa a 1 nada más por el candado de arriba — `execute` está
 * completamente mockeado (devuelve un resultado fijo), así que no corre su
 * propia lógica de idempotencia real. La idempotencia DENTRO del use-case
 * (qué pasa si execute() se llama dos veces de verdad para el mismo
 * documento, sin este candado) se prueba aparte, con el código real, en
 * emitir-ecf-idempotencia-existente.spec.ts.
 *
 * Aparte, y esto NO lo cubre ningún test porque es un hallazgo de lectura de
 * código, no de comportamiento ejecutable: el único índice único real sobre
 * `ecf` (documentoOrigenTipo, documentoOrigenId) es `idx_ecf_origen_unico_aceptado`
 * — un índice PARCIAL que solo exige unicidad cuando estadoDGII='aceptado'
 * (ver la migración 1765300000000-RelajarUnicidadFacturaIdEcf.ts). Dos
 * inserts concurrentes que ambos quedan en 'pendiente_envio' NO violan ese
 * índice — ambos pueden tener éxito, cada uno con su propio eNCF. El
 * `findOne` + `INSERT` de emitir-ecf.use-case.ts tiene la misma ventana
 * TOCTOU que tenía cambiarEstado() antes de este candado. La defensa final
 * (un índice único parcial que excluya solo rechazados/anulados, no solo que
 * incluya aceptados) queda pendiente de crear — primero hay que confirmar
 * contra producción que ningún e-CF existente lo violaría ya (ver
 * verificar-duplicados-concurrencia-emitir-pos.js, sección 4).
 */
import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';

jest.mock('../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
  reportServerError:  jest.fn(),
}));

const FACTURA_BASE = {
  id: 777, empresaId: 61, usuarioId: 94,
  vendedorId: 1, nombreVendedor: 'Juan', tipoPago: 'CREDITO', diasCredito: 30,
  detalles: [{ productoId: 55, cantidad: 2 }],
  notas: '', fecha: new Date('2026-10-07'),
  total: 1000, subtotal: 1000, iva: 0, tipoNcf: 'E32', folio: 'FAC-777',
};

function buildService() {
  // "La fila real" compartida — solo se muta vía facturaRepository.update,
  // igual que en Postgres. Arranca en BORRADOR.
  let estadoDB = FacturaEstado.BORRADOR;

  // Simulación de pg_advisory_xact_lock: una cola FIFO por conexión —
  // transaction() no corre su callback hasta que la anterior en la cola
  // termine (commit/rollback), igual que Postgres bloquearía un segundo
  // `pg_advisory_xact_lock(id)` del mismo id.
  let colaLock: Promise<unknown> = Promise.resolve();
  const facturaRepository: any = {
    update: jest.fn((_id: number, patch: any) => {
      if (patch?.estado) estadoDB = patch.estado;
      return Promise.resolve({ affected: 1 });
    }),
  };
  const manager = {
    query: async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT estado FROM facturas')) return [{ estado: estadoDB }];
      throw new Error('query no reconocida en el manager de prueba: ' + sql);
    },
    // manager.getRepository(Factura) dentro de la transacción — reusa el
    // MISMO update() que muta `estadoDB`, igual que facturaRepository fuera.
    getRepository: () => facturaRepository,
  };
  const dataSource: any = {
    query: jest.fn().mockResolvedValue([]),
    transaction: (cb: (m: unknown) => Promise<unknown>) => {
      const miTurno = colaLock.then(() => cb(manager));
      colaLock = miTurno.catch(() => undefined);
      return miTurno;
    },
  };
  // findOne() refleja la fila compartida — así la respuesta idempotente
  // (respuestaEcfEnCurso) ve el estado real tras el candado.
  const findOneMock = jest.fn(async () => ({ ...FACTURA_BASE, estado: estadoDB, ecf: null }));

  const svc: any = Object.create(FacturasService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.facturaRepository = facturaRepository;
  svc.findOne           = findOneMock;
  svc.dataSource        = dataSource;
  // getUserId() sin contexto → salta validarAutorizacionVentaCredito (no es lo
  // que esta prueba mide) pero esCredito sigue siendo true para la CxC.
  svc.tenantService     = { getUserId: () => undefined, getAlmacenId: () => undefined, getEmpresaId: () => 61 };
  svc.cajaService       = { esCajaAbiertaVendedor: jest.fn().mockResolvedValue({ ok: true }) };
  svc.limitesService    = { verificarLimiteIngresos: jest.fn().mockResolvedValue(undefined), actualizarCacheIngresos: jest.fn().mockResolvedValue(undefined) };
  svc.inventarioService = { registrarSalida: jest.fn().mockResolvedValue(undefined) };
  svc.cxcService        = { crear: jest.fn().mockResolvedValue(undefined) };
  svc.asientosService   = { asientoFacturaEmitida: jest.fn().mockResolvedValue(undefined) };
  svc.realtimeService   = { notify: jest.fn() };
  svc.rncService         = { consultarRNC: jest.fn() };
  svc.vendedorResolver  = { resolverVendedor: jest.fn() };
  svc.emitirECFUseCase  = { execute: jest.fn().mockResolvedValue({ ecf: { id: 1 }, encf: 'E320000000001', estado: 'pendiente_envio', idempotente: false }) };

  return {
    svc: svc as FacturasService,
    facturaRepository, findOneMock, dataSource,
    inventarioService: svc.inventarioService, cxcService: svc.cxcService,
    asientosService: svc.asientosService, emitirECFUseCase: svc.emitirECFUseCase,
  };
}

describe('cambiarEstado() — dos peticiones EMITIDA en paralelo, ambas leyendo BORRADOR (carrera real)', () => {
  it('UN solo movimiento de inventario por línea, UNA sola CxC, UN solo asiento, UNA sola llamada a emitirECFUseCase.execute', async () => {
    const mocks = buildService();

    const [r1, r2] = await Promise.all([
      (mocks.svc as any).cambiarEstado(777, FacturaEstado.EMITIDA, true),
      (mocks.svc as any).cambiarEstado(777, FacturaEstado.EMITIDA, true),
    ]);

    const conteos = {
      inventario: mocks.inventarioService.registrarSalida.mock.calls.length,
      cxc:        mocks.cxcService.crear.mock.calls.length,
      asiento:    mocks.asientosService.asientoFacturaEmitida.mock.calls.length,
      ecf:        mocks.emitirECFUseCase.execute.mock.calls.length,
    };
    // eslint-disable-next-line no-console
    console.log('[concurrencia] conteos:', conteos);

    expect(conteos.inventario).toBe(1);
    expect(conteos.cxc).toBe(1);
    expect(conteos.asiento).toBe(1);
    expect(conteos.ecf).toBe(1);

    // Una de las dos respuestas es la idempotente (enCurso:true) — la otra
    // es la emisión real. Nunca las dos "reales".
    const enCurso = [r1, r2].filter((r: any) => r?.enCurso === true);
    expect(enCurso.length).toBe(1);
  });
});
