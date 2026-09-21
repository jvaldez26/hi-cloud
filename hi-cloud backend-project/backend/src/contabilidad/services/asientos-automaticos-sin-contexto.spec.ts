/**
 * P0 (2026-09-21) — FALLAR CERRADO cuando AsientosAutomaticosService corre
 * sin contexto de empresa (this.tenantService.getEmpresaId() lanza).
 *
 * Antes: `private get eid() { try { return ...; } catch { return undefined; } }`
 * y cada punto de consulta hacía `if (this.eid) where.empresaId = this.eid`
 * — sin contexto, el `if` era falso y la query salía SIN FILTRO. Contra un
 * mock que solo devuelve lo que se le pide, eso no se nota; contra Postgres
 * real (u otro caller sin contexto: cron, listener) podía devolver — o
 * escribir — datos de OTRA empresa.
 *
 * Este archivo prueba, con mocks que capturan el `where` real de cada
 * llamada, que ahora:
 *   1. _crearAsientoContabilizado() nunca persiste un asiento sin empresaId
 *      — corta ANTES de tocar la BD, ni siquiera resuelve las cuentas.
 *   2. resolverLineasAsiento() (vía previsualizar, que no pasa por el guard
 *      de arriba) SIEMPRE manda empresaId en el WHERE — un centinela
 *      imposible (-1) cuando no hay contexto, nunca lo omite.
 *   3. getCuenta() exige empresaId — no puede devolver la cuenta de otra
 *      empresa por descuido de un caller.
 *
 * (El caso de revertirAsiento() vive en revertir-asiento.spec.ts, junto al
 * resto de su propia suite.)
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { TipoOrigenAsiento } from '../entities/asiento-contable.entity';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

function makeService(opts: { conContexto: boolean; cuentasPorFind?: any[]; cuentaPorFindOne?: any }) {
  const cuentaRepository = {
    find:    jest.fn().mockResolvedValue(opts.cuentasPorFind ?? []),
    findOne: jest.fn().mockResolvedValue(opts.cuentaPorFindOne ?? null),
  };
  const asientoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 1, ...data })),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => data),
  };
  const tenantService = {
    getEmpresaId: () => {
      if (!opts.conContexto) throw new Error('Se requiere contexto de empresa.');
      return 7;
    },
    getUserId: () => 5,
  };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc, cuentaRepository, asientoRepository, lineaRepository };
}

beforeEach(() => jest.clearAllMocks());

describe('AsientosAutomaticosService — fallar cerrado sin contexto de empresa', () => {
  describe('_crearAsientoContabilizado (vía el alias público crearAsientoContabilizado)', () => {
    it('sin contexto: no persiste nada, ni siquiera intenta resolver las cuentas', async () => {
      const { svc, cuentaRepository, asientoRepository, lineaRepository } = makeService({ conContexto: false });

      const resultado = await svc.crearAsientoContabilizado({
        descripcion: 'Test', tipoOrigen: TipoOrigenAsiento.AJUSTE,
        referenciaId: 1, referenciaFolio: 'TEST-1', userId: 5,
        lineas: [
          { codigo: '1.1.1.02', descripcion: 'Debe', debe: 100, haber: 0 },
          { codigo: '1.1.2.01', descripcion: 'Haber', debe: 0, haber: 100 },
        ],
      });

      expect(resultado).toBeNull();
      expect(cuentaRepository.find).not.toHaveBeenCalled();   // ni siquiera llega a resolver líneas
      expect(asientoRepository.save).not.toHaveBeenCalled();
      expect(lineaRepository.save).not.toHaveBeenCalled();
      expect(reportServiceError).toHaveBeenCalledWith(
        expect.any(Error), 'asiento_sin_contexto_empresa',
        expect.objectContaining({ referenciaId: '1', referenciaFolio: 'TEST-1' }),
      );
    });

    it('con contexto: sigue creando el asiento normal (regresión)', async () => {
      const { svc, asientoRepository } = makeService({
        conContexto: true,
        cuentasPorFind: [
          { id: 1, codigo: '1.1.1.02', isActive: true, permiteMovimientos: true },
          { id: 2, codigo: '1.1.2.01', isActive: true, permiteMovimientos: true },
        ],
      });

      const resultado = await svc.crearAsientoContabilizado({
        descripcion: 'Test', tipoOrigen: TipoOrigenAsiento.AJUSTE,
        referenciaId: 1, referenciaFolio: 'TEST-1', userId: 5,
        lineas: [
          { codigo: '1.1.1.02', descripcion: 'Debe', debe: 100, haber: 0 },
          { codigo: '1.1.2.01', descripcion: 'Haber', debe: 0, haber: 100 },
        ],
      });

      expect(resultado).not.toBeNull();
      expect(asientoRepository.save).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 7 }));
    });
  });

  describe('resolverLineasAsiento (vía previsualizarGasto, que no pasa por el guard de arriba)', () => {
    it('sin contexto: el WHERE de la búsqueda de cuentas lleva un empresaId centinela — nunca se omite', async () => {
      const { svc, cuentaRepository } = makeService({ conContexto: false });

      await svc.previsualizarGasto(100, 0, 100, 'Gasto de prueba', '5.1.1.01');

      expect(cuentaRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ empresaId: -1 }) }),
      );
    });

    it('sin contexto: como el centinela no matchea ninguna cuenta real, la vista previa sale ok:false — nunca ok:true con datos de otra empresa', async () => {
      const { svc } = makeService({ conContexto: false }); // find() devuelve [] por defecto

      const preview = await svc.previsualizarGasto(100, 0, 100, 'Gasto de prueba', '5.1.1.01');

      expect(preview.ok).toBe(false);
      expect(preview.error).toContain('no encontrada');
    });

    it('con contexto: el WHERE lleva el empresaId real (regresión)', async () => {
      const { svc, cuentaRepository } = makeService({
        conContexto: true,
        cuentasPorFind: [{ id: 1, codigo: '5.1.1.01', isActive: true, permiteMovimientos: true }],
      });

      await svc.previsualizarGasto(100, 0, 100, 'Gasto de prueba', '5.1.1.01');

      expect(cuentaRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ empresaId: 7 }) }),
      );
    });
  });

  describe('getCuenta (helper privado)', () => {
    it('exige empresaId — el WHERE siempre lo incluye, nunca hace un findOne sin filtro', async () => {
      const { svc, cuentaRepository } = makeService({ conContexto: true });

      await svc.getCuenta('1.1.1.01', 7);

      expect(cuentaRepository.findOne).toHaveBeenCalledWith({
        where: { codigo: '1.1.1.01', isActive: true, empresaId: 7 },
      });
    });
  });
});
