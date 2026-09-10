/**
 * Reversas contables — AsientosAutomaticosService.revertirAsiento().
 *
 * Regla de diseño: reversa = contra-asiento NUEVO con débitos/créditos
 * invertidos. NUNCA se borra, desactiva ni edita el original — conserva su
 * fecha. El contra-asiento lleva la fecha del EVENTO de reversión, no la del
 * documento original.
 *
 * COBERTURA:
 * 1. Invierte debe/haber de cada línea y usa la fecha del evento de reversión
 *    (no la del original).
 * 2. Idempotente: doble llamada sobre el mismo documento no duplica — retorna
 *    el contra-asiento existente.
 * 3. Documento cuyo asiento nunca se creó: no rompe, reporta a Sentry y
 *    retorna null.
 * 4. Dos empresas con el MISMO tipoOrigen+referenciaId (colisión numérica
 *    real entre tablas con auto-increment propio): cada una revierte solo su
 *    propio asiento, nunca el de la otra.
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { TipoOrigenAsiento } from '../entities/asiento-contable.entity';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

/**
 * DataSource/repos fake orientados a revertirAsiento: los "originales" viven
 * en un mapa `${empresaId}:${tipoOrigen}:${referenciaId}` (así se puede
 * simular la colisión real entre dos empresas con el mismo id numérico), y
 * los contra-asientos ya existentes en un mapa por id del original.
 */
function makeServiceForReversa(opts: {
  empresaId?: number;
  originales?: Record<string, any>;
  reversosExistentes?: Record<number, any>;
  userId?: number | null;
} = {}) {
  const originales = opts.originales ?? {};
  const reversosExistentes: Record<number, any> = { ...(opts.reversosExistentes ?? {}) };
  let nextId = 1000;

  const asientoRepository = {
    create: jest.fn((data: any) => ({ ...data })),
    save:   jest.fn(async (data: any) => ({ id: nextId++, ...data })),
    findOne: jest.fn(async ({ where }: any) => {
      // El lookup del "existente" pasa asientoRevertidoId como número; el del
      // "original" lo pasa como IsNull() (un FindOperator, no un número) —
      // así se distinguen ambos casos sin depender de internals de TypeORM.
      if (typeof where.asientoRevertidoId === 'number') {
        const row = reversosExistentes[where.asientoRevertidoId];
        if (!row) return null;
        if (where.empresaId !== undefined && row.empresaId !== where.empresaId) return null;
        return row;
      }
      const key = `${where.empresaId}:${where.tipoOrigen}:${where.referenciaId}`;
      return originales[key] ?? null;
    }),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => data),
  };
  const tenantService = {
    getEmpresaId: () => {
      if (opts.empresaId === undefined) throw new Error('sin contexto de empresa');
      return opts.empresaId;
    },
    getUserId: () => opts.userId ?? 5,
  };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc, asientoRepository, lineaRepository };
}

beforeEach(() => jest.clearAllMocks());

describe('AsientosAutomaticosService.revertirAsiento', () => {
  it('invierte debe/haber de cada línea y usa la fecha del EVENTO de reversión, no la del original', async () => {
    const original = {
      id: 1, empresaId: 7, numero: 'ASI-0001',
      tipoOrigen: TipoOrigenAsiento.FACTURA, referenciaId: 55, referenciaFolio: 'FAC-1',
      fecha: '2026-01-15',
      lineas: [
        { cuentaContableId: 1, descripcion: 'Cta. por cobrar FAC-1',      debe: 1180, haber: 0 },
        { cuentaContableId: 2, descripcion: 'Ingreso por venta FAC-1',    debe: 0,    haber: 1000 },
        { cuentaContableId: 3, descripcion: 'ITBIS débito fiscal FAC-1', debe: 0,    haber: 180 },
      ],
    };
    const { svc, asientoRepository, lineaRepository } = makeServiceForReversa({
      empresaId: 7,
      originales: { '7:factura:55': original },
    });

    const r = await svc.revertirAsiento(TipoOrigenAsiento.FACTURA, 55, '2026-09-10', 'Cancelación factura');

    expect(r).not.toBeNull();
    expect(r.fecha).toBe('2026-09-10');       // fecha del evento, NUNCA 2026-01-15
    expect(r.asientoRevertidoId).toBe(1);     // vínculo al original
    expect(r.totalDebe).toBe(1180);
    expect(r.totalHaber).toBe(1180);

    const lineasGuardadas = lineaRepository.save.mock.calls[0][0];
    expect(lineasGuardadas).toEqual([
      { asientoId: r.id, cuentaContableId: 1, descripcion: 'Reversa: Cta. por cobrar FAC-1',      debe: 0,    haber: 1180 },
      { asientoId: r.id, cuentaContableId: 2, descripcion: 'Reversa: Ingreso por venta FAC-1',    debe: 1000, haber: 0 },
      { asientoId: r.id, cuentaContableId: 3, descripcion: 'Reversa: ITBIS débito fiscal FAC-1', debe: 180,  haber: 0 },
    ]);

    // El original NUNCA se toca: ni update ni delete sobre asientoRepository.
    expect(asientoRepository.save).toHaveBeenCalledTimes(1); // solo el contra-asiento
  });

  it('doble llamada sobre el mismo documento no duplica — retorna el contra-asiento existente', async () => {
    const original = {
      id: 1, empresaId: 7, numero: 'ASI-0001',
      tipoOrigen: TipoOrigenAsiento.FACTURA, referenciaId: 55, referenciaFolio: 'FAC-1', lineas: [],
    };
    const reversaExistente = { id: 2, empresaId: 7, numero: 'ASI-0002', asientoRevertidoId: 1 };
    const { svc, asientoRepository } = makeServiceForReversa({
      empresaId: 7,
      originales:         { '7:factura:55': original },
      reversosExistentes: { 1: reversaExistente },
    });

    const r = await svc.revertirAsiento(TipoOrigenAsiento.FACTURA, 55, '2026-09-10', 'Cancelación factura');

    expect(r).toEqual(reversaExistente);
    expect(asientoRepository.save).not.toHaveBeenCalled(); // no crea nada nuevo
  });

  it('documento cuyo asiento nunca se creó: no rompe, reporta a Sentry y retorna null', async () => {
    const { svc, asientoRepository } = makeServiceForReversa({ empresaId: 7 }); // sin originales

    const r = await svc.revertirAsiento(TipoOrigenAsiento.FACTURA, 999, '2026-09-10', 'Cancelación');

    expect(r).toBeNull();
    expect(asientoRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_reversa_original_no_encontrado',
      expect.objectContaining({ tipoOrigen: TipoOrigenAsiento.FACTURA, referenciaId: '999' }),
    );
  });

  it('dos empresas con el mismo tipoOrigen+referenciaId: cada una revierte solo su propio asiento', async () => {
    // Colisión real: cuentas_por_cobrar/facturas son secuencias independientes
    // por empresa — el id 55 existe en ambas, apuntando a documentos distintos.
    const originalEmpresa7  = {
      id: 1, empresaId: 7,  numero: 'ASI-0001',
      tipoOrigen: TipoOrigenAsiento.FACTURA, referenciaId: 55, referenciaFolio: 'FAC-1',
      lineas: [{ cuentaContableId: 1, descripcion: 'x', debe: 100, haber: 0 }],
    };
    const originalEmpresa42 = {
      id: 2, empresaId: 42, numero: 'ASI-0002',
      tipoOrigen: TipoOrigenAsiento.FACTURA, referenciaId: 55, referenciaFolio: 'FAC-1',
      lineas: [{ cuentaContableId: 9, descripcion: 'y', debe: 200, haber: 0 }],
    };
    const originales = { '7:factura:55': originalEmpresa7, '42:factura:55': originalEmpresa42 };

    const { svc: svc7 }  = makeServiceForReversa({ empresaId: 7,  originales });
    const { svc: svc42 } = makeServiceForReversa({ empresaId: 42, originales });

    const r7  = await svc7.revertirAsiento(TipoOrigenAsiento.FACTURA, 55, '2026-09-10', 'x');
    const r42 = await svc42.revertirAsiento(TipoOrigenAsiento.FACTURA, 55, '2026-09-10', 'x');

    expect(r7!.asientoRevertidoId).toBe(1);   // revierte el de la empresa 7
    expect(r42!.asientoRevertidoId).toBe(2);  // revierte el de la empresa 42, nunca el de la 7
    // La línea original solo tenía debe (100/200, haber 0) → invertida queda en haber.
    expect(r7!.totalHaber).toBe(100);
    expect(r42!.totalHaber).toBe(200);
  });

  it('un error inesperado durante la reversa se reporta y no rompe el flujo (nunca lanza)', async () => {
    const { svc, asientoRepository } = makeServiceForReversa({ empresaId: 7 });
    asientoRepository.findOne.mockRejectedValueOnce(new Error('conexión perdida'));

    await expect(
      svc.revertirAsiento(TipoOrigenAsiento.FACTURA, 55, '2026-09-10', 'x'),
    ).resolves.toBeNull();

    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error), 'asiento_reversion_generica', expect.any(Object),
    );
  });
});
