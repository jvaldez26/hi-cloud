import { VendedorResolverService } from './vendedor-resolver.service';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

/**
 * Quién vende no lo decide el navegador.
 *
 * El cierre de caja reúne las ventas por vendedorId + fecha. Una factura con
 * vendedorId NULL no entra en ningún cuadre y nadie se entera: así se perdieron
 * RD$16.574,99 de la caja #446 de FERRETERIA PAVEL, 5 de 16 facturas del turno.
 *
 * Estas reglas son las que impiden que vuelva a pasar.
 */
describe('resolverVendedor', () => {
  /**
   * FacturasService arrastra 18 dependencias; solo dataSource participa aquí.
   * Se construye por prototipo para que el test no se rompa cada vez que el
   * constructor gane un servicio nuevo.
   */
  const crearService = (filas: Record<string, unknown>[][]) => {
    const query = jest.fn();
    filas.forEach(f => query.mockResolvedValueOnce(f));
    query.mockResolvedValue([]);

    const svc: any = Object.create(VendedorResolverService.prototype);
    svc.logger            = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    svc.dataSource        = { query };
    svc.sinVendedorBuffer = new Map();
    return { svc, query };
  };

  const VENDEDOR_DEL_USUARIO = [{ id: 38, nombre: 'Yaribel' }];
  const OTRO_VENDEDOR        = [{ id: 12, nombre: 'Vendedor de campo' }];

  beforeEach(() => jest.clearAllMocks());

  it('usa el vendedor asociado al usuario autenticado', async () => {
    const { svc } = crearService([VENDEDOR_DEL_USUARIO]);
    await expect(svc.resolverVendedor({}, 94, 61))
      .resolves.toEqual({ vendedorId: 38, nombreVendedor: 'Yaribel' });
  });

  it('ignora el vendedorId del cliente cuando el usuario tiene uno asociado', async () => {
    // El caso que el control antifraude tiene que cubrir: el body dice otra cosa.
    const { svc } = crearService([VENDEDOR_DEL_USUARIO]);
    const r = await svc.resolverVendedor({ vendedorId: 99 }, 94, 61);

    expect(r).toEqual({ vendedorId: 38, nombreVendedor: 'Yaribel' });
    expect(svc.logger.warn).toHaveBeenCalled();
  });

  it('respeta el vendedorId del dto cuando el usuario NO tiene vendedor asociado', async () => {
    // La mayoría de empresas aún no ligan vendedores a usuarios. Imponer el
    // derivado (null) les borraría la atribución a miles de facturas.
    const { svc } = crearService([[], OTRO_VENDEDOR]);
    await expect(svc.resolverVendedor({ vendedorId: 12 }, 66, 44))
      .resolves.toEqual({ vendedorId: 12, nombreVendedor: 'Vendedor de campo' });
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('descarta un vendedorId que no es de la empresa', async () => {
    const { svc } = crearService([[], []]);   // ni derivado ni vendedor válido
    const r = await svc.resolverVendedor({ vendedorId: 12 }, 66, 44);

    expect(r.vendedorId).toBeNull();
    expect(svc.sinVendedorBuffer.size).toBe(1);
  });

  it('consulta el vendedor del dto acotado a la empresa', async () => {
    const { svc, query } = crearService([[], OTRO_VENDEDOR]);
    await svc.resolverVendedor({ vendedorId: 12 }, 66, 44);

    // Un id de otra empresa no puede colarse: el WHERE lleva empresaId.
    expect(query.mock.calls[1][0]).toContain('"empresaId" = $2');
    expect(query.mock.calls[1][1]).toEqual([12, 44]);
  });

  it('no bloquea la venta cuando no hay forma de resolverlo', async () => {
    const { svc } = crearService([[]]);
    await expect(svc.resolverVendedor({}, 66, 44))
      .resolves.toEqual({ vendedorId: null, nombreVendedor: null });
  });
});

describe('alertas de facturas sin vendedor', () => {
  const crearService = () => {
    const svc: any = Object.create(VendedorResolverService.prototype);
    svc.logger            = { warn: jest.fn() };
    svc.sinVendedorBuffer = new Map();
    return svc;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('emite UNA alerta por empresa y día, con el conteo', () => {
    const svc = crearService();
    for (let i = 0; i < 7; i++) svc.acumularFacturaSinVendedor(61, 94);

    // Nada mientras la ráfaga sigue viva.
    expect(reportServiceError).not.toHaveBeenCalled();

    jest.advanceTimersByTime(15 * 60_000);

    expect(reportServiceError).toHaveBeenCalledTimes(1);
    const [error, operacion, tags] = (reportServiceError as jest.Mock).mock.calls[0];
    expect(operacion).toBe('facturas.sinVendedor');
    expect(tags).toMatchObject({ empresaId: 61, facturas: 7 });
    expect((error as Error).message).toContain('7 factura(s) sin vendedor');
  });

  it('separa las alertas por empresa', () => {
    const svc = crearService();
    svc.acumularFacturaSinVendedor(61, 94);
    svc.acumularFacturaSinVendedor(44, 66);
    jest.advanceTimersByTime(15 * 60_000);

    expect(reportServiceError).toHaveBeenCalledTimes(2);
  });

  it('lista los usuarios implicados sin repetirlos', () => {
    const svc = crearService();
    svc.acumularFacturaSinVendedor(61, 94);
    svc.acumularFacturaSinVendedor(61, 93);
    svc.acumularFacturaSinVendedor(61, 94);
    jest.advanceTimersByTime(15 * 60_000);

    expect((reportServiceError as jest.Mock).mock.calls[0][2].usuarios).toBe('93,94');
  });

  it('no espera indefinidamente: una ráfaga larga avisa igual', () => {
    const svc = crearService();
    svc.acumularFacturaSinVendedor(61, 94);

    // Una factura cada 10 min durante dos horas: el debounce nunca vencería solo.
    for (let i = 0; i < 12; i++) {
      jest.advanceTimersByTime(10 * 60_000);
      svc.acumularFacturaSinVendedor(61, 94);
    }
    jest.advanceTimersByTime(15 * 60_000);

    expect(reportServiceError).toHaveBeenCalled();
  });

  it('al apagar el proceso no se pierde lo pendiente', () => {
    const svc = crearService();
    svc.acumularFacturaSinVendedor(61, 94);
    svc.onModuleDestroy();

    expect(reportServiceError).toHaveBeenCalledTimes(1);
    expect(svc.sinVendedorBuffer.size).toBe(0);
  });
});
