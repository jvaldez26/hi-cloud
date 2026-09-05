import { FacturasService }            from '../facturas.service';
import { FacturaEstado }              from '../entities/factura.entity';
import { VendedorResolverService }    from './vendedor-resolver.service';
import { CotizacionesService }        from '../../cotizaciones/cotizaciones.service';
import { PreFacturaService }          from '../../pre-factura/pre-factura.service';
import { ContratosService }           from '../../contratos/contratos.service';
import { ServiciosService }           from '../../servicios/servicios.service';
import { GeneracionRecurrenteService }  from '../../facturas-recurrentes/services/generacion-recurrente.service';
import { RestauranteService }         from '../../restaurante/restaurante.service';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
  reportServerError:  jest.fn(),
}));

/**
 * LOS SIETE CAMINOS.
 *
 * Hay siete sitios en el backend que crean facturas ademas de facturas.create().
 * Durante meses solo create() resolvia el vendedor, y los otros seis producian
 * facturas con vendedorId NULL: 249 en 11 empresas al 2026-08-26, invisibles
 * para todos los cierres de caja porque recalcularDesdeBD reune por vendedorId.
 *
 * La regla que fija este test: NINGUNA factura llega a EMITIDA sin vendedor
 * cuando el usuario tiene uno asociado. Da igual por que camino se creo.
 *
 * Cinco caminos crean BORRADOR y el vendedor se les pone al emitir, en
 * cambiarEstado(), que es la unica puerta borrador -> emitida. Dos nacen
 * EMITIDA y tienen que resolverlo ellos mismos al crear.
 */

const EMPRESA  = 61;
const USUARIO  = { id: 94, nombre: 'Yaribel' } as any;
const VENDEDOR = { id: 38, nombre: 'Yaribel' };

/** Resolver REAL, con un dataSource que devuelve el vendedor del usuario. */
const resolverReal = () => {
  const svc: any = Object.create(VendedorResolverService.prototype);
  svc.logger            = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  svc.dataSource        = { query: jest.fn().mockResolvedValue([VENDEDOR]) };
  svc.sinVendedorBuffer = new Map();
  return svc as VendedorResolverService;
};

/** Repo que captura lo que se le manda a create(). */
const repoCaptor = () => {
  const capturado: any[] = [];
  const repo: any = {
    capturado,
    create:  jest.fn((x: any) => { capturado.push(x); return { ...x }; }),
    save:    jest.fn(async (x: any) => ({ id: 777, ...x })),
    count:   jest.fn().mockResolvedValue(0),
    update:  jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn(),
  };
  return repo;
};

const ALTO = Symbol('alto-tras-resolver-vendedor');

/**
 * Emite un borrador con el cambiarEstado() REAL y devuelve lo que se persistio.
 *
 * cambiarEstado hace mucho mas despues de fijar el vendedor (e-CF, asientos,
 * CxC...). Cortamos en el primer paso posterior —el limite de ingresos— para que
 * el test afirme una sola cosa y no se rompa cuando cambie el resto.
 */
async function emitir(borrador: any) {
  const facturaRepository = repoCaptor();
  const svc: any = Object.create(FacturasService.prototype);

  svc.logger            = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  svc.facturaRepository = facturaRepository;
  svc.vendedorResolver  = resolverReal();
  svc.tenantService     = { getUserId: () => USUARIO.id, getEmpresaId: () => EMPRESA };
  svc.cajaService       = { esCajaAbiertaVendedor: jest.fn().mockResolvedValue({ ok: true }) };
  svc.limitesService    = { verificarLimiteIngresos: jest.fn().mockRejectedValue(ALTO) };
  svc.findOne           = jest.fn().mockResolvedValue({
    id:        777,
    empresaId: EMPRESA,
    estado:    FacturaEstado.BORRADOR,
    folio:     'FAC-777',
    total:     1000,
    fecha:     new Date(), // el guard de fecha (±30 días) exige el campo
    notas:     borrador.notas,
    vendedorId: borrador.vendedorId ?? null,
  });

  await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toBe(ALTO);
  return facturaRepository.update.mock.calls[0]?.[1];
}

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// Los cinco que crean BORRADOR: el vendedor se les pone al emitir
// ─────────────────────────────────────────────────────────────────────────────

const caminosBorrador = [
  {
    nombre: '2. cotizacion -> factura',
    crear: async () => {
      const facturaRepository = repoCaptor();
      const svc: any = Object.create(CotizacionesService.prototype);
      svc.facturaRepository        = facturaRepository;
      svc.facturaDetalleRepository = repoCaptor();
      svc.cotizacionRepository     = repoCaptor();
      svc.tenantService            = { getEmpresaId: () => EMPRESA };
      svc.findById = jest.fn().mockResolvedValue({
        id: 1, estado: 'aceptada', facturaId: null, clienteId: 5, numero: 'COT-1',
        notas: null, subtotal: 1000, iva: 180, total: 1180, detalles: [],
      });
      await svc.convertirAFactura(1, USUARIO).catch(() => null);
      return facturaRepository.capturado[0];
    },
  },
  {
    nombre: '4. contrato (cron y manual)',
    crear: async () => {
      const facturaRepo = repoCaptor();
      const svc: any = Object.create(ContratosService.prototype);
      svc.facturaRepo   = facturaRepo;
      svc.detalleRepo   = repoCaptor();
      svc.contratoRepo  = repoCaptor();
      svc.dataSource    = { query: jest.fn().mockResolvedValue([{ max: 100 }]) };
      svc.tenantService = { getEmpresaId: () => EMPRESA };
      svc.findById = jest.fn().mockResolvedValue({
        id: 1, estado: 'activo', empresaId: EMPRESA, clienteId: 5, userId: 94,
        numero: 'CTR-1', nombre: 'Mantenimiento', montoBase: 1000, porcentajeIva: 18,
      });
      await svc.generarFactura(1).catch(() => null);
      return facturaRepo.capturado[0];
    },
  },
  {
    nombre: '5. orden de servicio -> factura',
    crear: async () => {
      const facturaRepo = repoCaptor();
      const svc: any = Object.create(ServiciosService.prototype);
      svc.facturaRepo     = facturaRepo;
      svc.factDetalleRepo = repoCaptor();
      svc.ordenRepo       = repoCaptor();
      svc.dataSource      = { query: jest.fn().mockResolvedValue([{ max: 100 }]) };
      svc.tenantService   = { getEmpresaId: () => EMPRESA };
      svc.findById = jest.fn().mockResolvedValue({
        id: 1, facturaId: null, empresaId: EMPRESA, clienteId: 5, numero: 'OS-1',
        descripcionEquipo: 'Laptop', total: 1000,
        detalles: [{ descripcion: 'x', total: 1000 }],
      });
      await svc.convertirAFactura(1, USUARIO).catch(() => null);
      return facturaRepo.capturado[0];
    },
  },
  {
    nombre: '7. duplicar factura',
    crear: async () => {
      const facturaRepository = repoCaptor();
      facturaRepository.findOne.mockResolvedValue({
        id: 1, empresaId: EMPRESA, clienteId: 5, folio: 'FAC-1',
        // La original SI tenia vendedor: el duplicado no debe heredarlo.
        vendedorId: 12, nombreVendedor: 'Otro que ya no trabaja aqui',
        moneda: 'DOP', tipoCambio: 1, tipoNcf: 'E32', tipoPago: 'CONTADO',
        diasCredito: 0, subtotal: 1000, iva: 180, total: 1180, notas: null,
        detalles: [],
      });
      const svc: any = Object.create(FacturasService.prototype);
      svc.facturaRepository = facturaRepository;
      svc.detalleRepository = repoCaptor();
      svc.tenantService     = { getEmpresaId: () => EMPRESA };
      svc.generarFolio      = jest.fn().mockResolvedValue('FAC-2');
      await svc.duplicar(1, USUARIO.id).catch(() => null);
      return facturaRepository.capturado[0];
    },
  },
];

describe('caminos que crean BORRADOR', () => {
  it.each(caminosBorrador)(
    '$nombre — nace en BORRADOR y sin vendedor, a proposito',
    async ({ crear }) => {
      const borrador = await crear();
      expect(borrador).toBeDefined();
      expect(borrador.estado).toBe(FacturaEstado.BORRADOR);
      // Un borrador no entra en ningun cuadre ni reporte: aqui aun no hubo venta.
      expect(borrador.vendedorId ?? null).toBeNull();
    },
  );

  it.each(caminosBorrador)('$nombre — al emitirlo sale CON vendedor', async ({ crear }) => {
    const borrador   = await crear();
    const persistido = await emitir(borrador);

    expect(persistido).toMatchObject({
      vendedorId:     VENDEDOR.id,
      nombreVendedor: VENDEDOR.nombre,
    });
  });

  it('7. duplicar NO hereda el vendedor de la factura original', async () => {
    const duplicado = await caminosBorrador.find(c => c.nombre.startsWith('7.'))!.crear();
    // Atribuir la venta de hoy a quien vendio hace seis meses es peor que dejarlo
    // nulo hasta que alguien la emita.
    expect(duplicado.vendedorId ?? null).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// La recurrente: nace BORRADOR, pero CON vendedor — es la excepcion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Este camino estaba con los demas BORRADOR, afirmando que nacia sin vendedor.
 * Dejo de ser cierto cuando la generacion se movio a GeneracionRecurrenteService:
 * ahora resuelve el vendedor al crear, y el propio servicio lo documenta —
 * "a diferencia de otros crones, en una recurrente si hay a quien imputar:
 * el dueno de la plantilla".
 *
 * Es mejor comportamiento, no una regresion, asi que el test afirma lo nuevo en
 * vez de forzar lo viejo. Sigue naciendo BORRADOR: cambiarEstado() es la unica
 * puerta a EMITIDA y el vendedor ya resuelto le sobrevive.
 *
 * Se ejercita insertarFactura() —el sitio que el inventario declara— alimentado
 * con lo que ejecutarCiclo() saca del resolver REAL, que es como corre en vivo.
 */
describe('6. factura recurrente (cron) — nace BORRADOR y CON vendedor', () => {
  const PLANTILLA = {
    id: 1, empresaId: EMPRESA, clienteId: 5, userId: USUARIO.id,
    nombre: 'Hosting', formaPago: 1, diasCredito: 0, tipoEcf: 'E32',
  } as any;

  const LINEA = {
    descripcion: 'Hosting mensual', precioUnitario: 1000, cantidad: 1,
    porcentajeIva: 18, subtotal: 1000, importeIva: 180, total: 1180,
  };

  /** EntityManager falso que captura lo que se manda a create(Factura, ...). */
  const managerCaptor = () => {
    const capturado: any[] = [];
    const manager: any = {
      capturado,
      create: jest.fn((entidad: any, x: any) => {
        if (entidad?.name === 'Factura') capturado.push(x);
        return { id: 777, ...x };
      }),
      save:   jest.fn(async (_e: any, x: any) => x),
      query:  jest.fn().mockResolvedValue([{ numero: 100 }]),
      findOneOrFail: jest.fn(async () => ({ id: 777, ...capturado[0] })),
    };
    return manager;
  };

  /** Resuelve el vendedor como lo hace ejecutarCiclo(), y luego inserta. */
  async function generar() {
    const svc: any = Object.create(GeneracionRecurrenteService.prototype);
    svc.logger           = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    svc.vendedorResolver = resolverReal();

    const { vendedorId, nombreVendedor } = await svc.vendedorResolver.resolverVendedor(
      {}, PLANTILLA.userId, PLANTILLA.empresaId,
    );

    const manager = managerCaptor();
    await svc.insertarFactura(manager, PLANTILLA, '2026-08-31', [LINEA], vendedorId, nombreVendedor);
    return manager.capturado[0];
  }

  it('nace en BORRADOR', async () => {
    expect((await generar()).estado).toBe(FacturaEstado.BORRADOR);
  });

  it('lleva el vendedor del dueno de la plantilla', async () => {
    expect(await generar()).toMatchObject({
      vendedorId:     VENDEDOR.id,
      nombreVendedor: VENDEDOR.nombre,
    });
  });

  /**
   * cambiarEstado() solo resuelve `if (!factura.vendedorId)`. Como la recurrente
   * ya llega con vendedor, no vuelve a preguntar ni reescribe nada: el vendedor
   * con el que nacio le sobrevive a la emision. Lo que se afirma aqui es que no
   * lo toca — ni para recalcularlo ni para borrarlo.
   */
  it('al emitirlo no lo vuelve a resolver: el vendedor que trae le sobrevive', async () => {
    const borrador = await generar();

    const facturaRepository = repoCaptor();
    const resolver = resolverReal();
    jest.spyOn(resolver, 'resolverVendedor');

    const svc: any = Object.create(FacturasService.prototype);
    svc.logger            = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    svc.facturaRepository = facturaRepository;
    svc.vendedorResolver  = resolver;
    svc.tenantService     = { getUserId: () => USUARIO.id, getEmpresaId: () => EMPRESA };
    svc.cajaService       = { esCajaAbiertaVendedor: jest.fn().mockResolvedValue({ ok: true }) };
    svc.limitesService    = { verificarLimiteIngresos: jest.fn().mockRejectedValue(ALTO) };
    svc.findOne           = jest.fn().mockResolvedValue({
      id: 777, empresaId: EMPRESA, estado: FacturaEstado.BORRADOR,
      fecha: new Date(), // el guard de fecha (±30 días) exige el campo
      folio: 'FAC-777', total: 1180, notas: borrador.notas,
      vendedorId: borrador.vendedorId, nombreVendedor: borrador.nombreVendedor,
    });

    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toBe(ALTO);

    expect(resolver.resolverVendedor).not.toHaveBeenCalled();
    const tocaVendedor = facturaRepository.update.mock.calls
      .some(([, payload]: any[]) => payload && 'vendedorId' in payload);
    expect(tocaVendedor).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Los dos que nacen EMITIDA: lo resuelven ellos al crear
// ─────────────────────────────────────────────────────────────────────────────

describe('caminos que nacen EMITIDA', () => {
  it('3. pre-factura -> factura sale con vendedor', async () => {
    const facturaRepo = repoCaptor();
    facturaRepo.createQueryBuilder = jest.fn(() => ({
      select: () => ({
        where: () => ({
          andWhere: () => ({ getRawOne: async () => ({ maxNum: 100 }) }),
        }),
      }),
    }));
    const svc: any = Object.create(PreFacturaService.prototype);
    svc.facturaRepo      = facturaRepo;
    svc.pfRepo           = repoCaptor();
    svc.pfDetRepo        = repoCaptor();
    svc.tenantSvc        = { getEmpresaId: () => EMPRESA };
    svc.ds               = { query: jest.fn().mockResolvedValue([]) };
    svc.vendedorResolver = resolverReal();
    svc.facturasService  = { cambiarEstado: jest.fn() };
    svc.findOne = jest.fn().mockResolvedValue({
      id: 1, estado: 'aprobada', clienteId: 5, subtotal: 1000, iva: 180,
      total: 1180, tipoNcf: 'E32', notas: null, sucursalId: null, detalles: [],
    });

    await svc.convertirAFactura(1, USUARIO.id).catch(() => null);

    expect(facturaRepo.capturado[0]).toMatchObject({
      estado:         FacturaEstado.EMITIDA,
      vendedorId:     VENDEDOR.id,
      nombreVendedor: VENDEDOR.nombre,
    });
  });

  it('8. comanda de restaurante sale con vendedor', async () => {
    const queries: { sql: string; params: any[] }[] = [];
    const qr: any = {
      connect:            jest.fn(),
      startTransaction:   jest.fn(),
      commitTransaction:  jest.fn(),
      rollbackTransaction: jest.fn(),
      release:            jest.fn(),
      query: jest.fn(async (sql: string, params: any[] = []) => {
        queries.push({ sql, params });
        if (sql.includes('INSERT INTO facturas'))        return [{ id: 777 }];
        if (sql.includes('siguiente_numero_secuencia'))  return [{ numero: 777 }];
        return [];
      }),
    };
    const svc: any = Object.create(RestauranteService.prototype);
    svc.ds     = { createQueryRunner: () => qr, query: jest.fn().mockResolvedValue([]) };
    svc.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    svc.tenantSvc = {
      getEmpresaId: () => EMPRESA,
      getUserId:    () => USUARIO.id,
      getSucursalId: () => null,
    };
    svc.vendedorResolver = resolverReal();
    svc.obtenerComanda   = jest.fn().mockResolvedValue({
      id: 1, estado: 'abierta', clienteId: 5, subtotal: 1000, descuento: 0, items: [],
    });

    await svc.cobrarComanda(1, { propina: 0, metodoPago: 'efectivo' }).catch(() => null);

    const insert = queries.find(q => q.sql.includes('INSERT INTO facturas'));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('"vendedorId"');
    // $9 y $10 son vendedorId y nombreVendedor
    expect(insert!.params[8]).toBe(VENDEDOR.id);
    expect(insert!.params[9]).toBe(VENDEDOR.nombre);
  });

  it('8. comanda de restaurante no crea la factura si no hay usuario', async () => {
    const svc: any = Object.create(RestauranteService.prototype);
    svc.tenantSvc = {
      getEmpresaId:  () => EMPRESA,
      getUserId:     () => null,
      getSucursalId: () => null,
    };
    // El usuario 0 no existe: antes se lo inventaba y la factura quedaba sin dueno.
    await expect(svc.cobrarComanda(1, {})).rejects.toThrow(/usuario/i);
  });
});
