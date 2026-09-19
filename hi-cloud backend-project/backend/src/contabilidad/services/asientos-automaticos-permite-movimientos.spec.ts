/**
 * P3 BLOQUE 2 — AsientosAutomaticosService valida permiteMovimientos antes
 * de persistir, mismo criterio que ContabilidadService.createAsiento(). El
 * motor automático nunca leía este flag y podía postear a una cuenta de
 * agrupación (una que solo existe para sumar sus hijas, ej. "6.1 Gastos
 * Operacionales") — eso descuadra los subtotales del catálogo aunque el
 * asiento en sí cuadre en partida doble.
 *
 * Cruce contra el seed (contabilidad.service.ts PLAN_CUENTAS, verificado
 * antes de este bloque): ninguno de los códigos de COD.* apunta hoy a una
 * cuenta de agrupación — todos son hojas con permiteMovimientos=true. Sí
 * se encontraron 7 códigos referenciados por el motor (GANANCIA_CAMBIARIA
 * 4.1.3.01, PERDIDA_CAMBIARIA 6.1.5.01, ISR_RET_POR_PAGAR 2.1.2.04, y los
 * literales 1.1.4.02, 1.1.4.03, 1.1.2.10, 4.1.2.01, 4.1.2.02 de cambio de
 * moneda/retenciones/préstamos) que NO EXISTEN en absoluto en el seed —
 * eso ya lo cubre la rama "cuenta no encontrada" de esta misma función
 * desde antes de este bloque; no es una cuenta de agrupación, es una
 * cuenta que nunca se creó. Reportado, sin corregir (fuera de este P3).
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { TipoOrigenAsiento } from '../entities/asiento-contable.entity';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

const cuentaMovimiento = (codigo: string, id: number, nombre = codigo) =>
  ({ id, codigo, nombre, isActive: true, permiteMovimientos: true }) as any;
const cuentaAgrupacion = (codigo: string, id: number, nombre = codigo) =>
  ({ id, codigo, nombre, isActive: true, permiteMovimientos: false }) as any;

function makeService(cuentas: any[]) {
  const cuentaRepository = { find: jest.fn().mockResolvedValue(cuentas) };
  const asientoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 1, ...data })),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => data),
  };
  const tenantService = { getEmpresaId: () => 7 };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc: svc as AsientosAutomaticosService, asientoRepository, lineaRepository };
}

beforeEach(() => jest.clearAllMocks());

describe('AsientosAutomaticosService — permiteMovimientos (P3 Bloque 2)', () => {
  it('cuenta de agrupación en una línea: NO se persiste, reporta a Sentry con el código y el nombre, y devuelve null', async () => {
    const { svc, asientoRepository, lineaRepository } = makeService([
      cuentaMovimiento('1.1.1.02', 1),
      cuentaAgrupacion('6.1', 2, 'Gastos Operacionales'), // agrupación real del seed
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Asiento contra una cuenta de agrupación',
      tipoOrigen:      TipoOrigenAsiento.AJUSTE,
      referenciaId:    1,
      referenciaFolio: 'TEST-1',
      userId:          5,
      lineas: [
        { codigo: '6.1',      descripcion: 'Gasto mal dirigido', debe: 100, haber: 0 },
        { codigo: '1.1.1.02', descripcion: 'Caja',               debe: 0,   haber: 100 },
      ],
    });

    expect(resultado).toBeNull();
    expect(asientoRepository.save).not.toHaveBeenCalled();
    expect(lineaRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_cuenta_agrupacion',
      expect.objectContaining({
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    '1',
        referenciaFolio: 'TEST-1',
        codigoCuenta:    '6.1',
      }),
    );
  });

  it('todas las cuentas de movimiento: se persiste normal (regresión)', async () => {
    const { svc, asientoRepository } = makeService([
      cuentaMovimiento('1.1.1.02', 1), cuentaMovimiento('1.1.2.01', 2),
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Asiento normal',
      tipoOrigen:      TipoOrigenAsiento.AJUSTE,
      referenciaId:    1,
      referenciaFolio: 'TEST-1',
      userId:          5,
      lineas: [
        { codigo: '1.1.1.02', descripcion: 'Caja',     debe: 100, haber: 0 },
        { codigo: '1.1.2.01', descripcion: 'Clientes', debe: 0,   haber: 100 },
      ],
    });

    expect(resultado).not.toBeNull();
    expect(asientoRepository.save).toHaveBeenCalled();
    expect(reportServiceError).not.toHaveBeenCalledWith(expect.any(Error), 'asiento_cuenta_agrupacion', expect.anything());
  });

  it('la validación de agrupación corre ANTES de acumular el total — no llega a evaluar partida doble con una línea inválida', async () => {
    const { svc, asientoRepository } = makeService([
      cuentaAgrupacion('6.1', 1, 'Gastos Operacionales'),
    ]);

    // Una sola línea, deliberadamente ya "balanceada" con sí misma en 0 —
    // si el chequeo de agrupación no cortara primero, esto pasaría de largo.
    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Línea única contra agrupación',
      tipoOrigen:      TipoOrigenAsiento.AJUSTE,
      referenciaId:    2,
      referenciaFolio: 'TEST-2',
      userId:          5,
      lineas: [{ codigo: '6.1', descripcion: 'x', debe: 0, haber: 0 }],
    });

    expect(resultado).toBeNull();
    expect(asientoRepository.save).not.toHaveBeenCalled();
  });
});
