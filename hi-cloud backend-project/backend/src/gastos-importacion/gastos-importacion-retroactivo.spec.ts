import { BadRequestException } from '@nestjs/common';
import { GastosImportacionService } from './gastos-importacion.service';
import { EstadoGasto } from './entities/gasto-importacion.entity';
import { TipoMovimiento } from '../inventario/entities/movimiento.entity';

/**
 * Tests del Caso B — aplicarGastoRetroactivo
 *
 * Cobertura:
 *   1. FÓRMULA       — invariante AVCO: stock × costoNuevo = stock × costoActual + montoAsignado
 *   2. REMANENTE     — redistribución correcta con/sin ajustes manuales
 *   3. ROLLBACK      — fallo del asiento → rollback, nada escrito
 *   4. IDEMPOTENCIA  — segunda aplicación rechazada
 *   5. CONFIRMACIÓN  — stock=0 y costoPromedio=0 piden confirmación
 *   6. KARDEX        — movimiento con cantidad=0 no altera stock
 */

// ── Constantes ────────────────────────────────────────────────────────────────
const EMPRESA  = 1;
const USUARIO  = 9;
const GASTO_ID = 5;
const PROD_A   = 10;
const PROD_B   = 20;
const DET_A    = 100;
const DET_B    = 200;
const COMPRA   = 42;

// ── Factories ─────────────────────────────────────────────────────────────────

function makeGasto(overrides: Record<string, unknown> = {}): any {
  return {
    id:                GASTO_ID,
    empresaId:         EMPRESA,
    compraId:          COMPRA,
    concepto:          'Flete marítimo',
    tipo:              'flete',
    montoDOP:          1_000,
    estado:            EstadoGasto.PENDIENTE,
    ajusteRetroactivo: true,
    lineas:            [],    // sin ajustes manuales por defecto
    aplicadoAt:        null,
    ...overrides,
  };
}

function makeDetalle(id: number, productoId: number, cantidadTotal: number, subtotal: number): any {
  return { id, productoId, cantidadTotal, subtotal, compraId: COMPRA };
}

function makeLinea(compraDetalleId: number, montoAsignado: number, montoUnitario: number, ajusteManual = false): any {
  return { compraDetalleId, montoAsignado, montoUnitario, ajusteManual };
}

// Dos detalles con igual valor FOB (prorrateo 50/50 del remanente)
const DEFAULT_DETALLES = [
  makeDetalle(DET_A, PROD_A, 10, 500),   // cantidadTotal=10
  makeDetalle(DET_B, PROD_B,  6, 500),   // cantidadTotal=6
];

// ── Builders de servicio ──────────────────────────────────────────────────────

/**
 * Construye un servicio mockeado para tests de la primera pasada
 * (sin QueryRunner — no llega a la segunda pasada).
 */
function buildService(opts: {
  gasto?:                 any;
  detalles?:              any[];
  stock?:                 number;
  costoPromedio?:         number;
} = {}): GastosImportacionService {
  const gasto    = opts.gasto    ?? makeGasto();
  const detalles = opts.detalles ?? DEFAULT_DETALLES;
  const stock    = opts.stock    ?? 100;
  const costo    = opts.costoPromedio ?? 50;

  const gastoRepo   = { findOne: jest.fn().mockResolvedValue(gasto) };
  const detalleRepo = { find:    jest.fn().mockResolvedValue(detalles) };
  const dataSource  = {
    query: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('configuracion'))  return [{ configuracion: null }];
      if (sql.includes('costoPromedio'))  return [{ costoPromedio: String(costo), stock: String(stock) }];
      return [];
    }),
    createQueryRunner: jest.fn(),    // no se usará en primera pasada
  };

  return new GastosImportacionService(
    gastoRepo as any,
    {} as any,          // lineaRepo
    detalleRepo as any,
    {} as any,          // compraRepo
    dataSource as any,
    { asientoGastoImportacion: jest.fn().mockResolvedValue(undefined) } as any,
    { getEmpresaId: () => EMPRESA } as any,
  );
}

/**
 * Construye un servicio mockeado con QueryRunner para tests de la segunda pasada.
 * Devuelve el servicio Y el mock del qr para hacer assertions.
 */
function buildServiceWithQr(opts: {
  gasto?:         any;
  detalles?:      any[];
  stock?:         number;
  costoPromedio?: number;
  asientosSvc?:   any;
} = {}): { service: GastosImportacionService; qrMock: any } {
  const gasto    = opts.gasto    ?? makeGasto();
  const detalles = opts.detalles ?? DEFAULT_DETALLES;
  const stock    = opts.stock    ?? 100;
  const costo    = opts.costoPromedio ?? 50;

  const qrMock = {
    connect:             jest.fn().mockResolvedValue(undefined),
    startTransaction:    jest.fn().mockResolvedValue(undefined),
    commitTransaction:   jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release:             jest.fn().mockResolvedValue(undefined),
    manager: {
      createQueryBuilder: jest.fn().mockImplementation(() => ({
        where:   jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne:  jest.fn().mockResolvedValue({
          id: PROD_A, costoPromedio: costo, stock, empresaId: EMPRESA,
        }),
      })),
      update: jest.fn().mockResolvedValue(undefined),
      save:   jest.fn().mockResolvedValue({ id: 1 }),
      query:  jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue({ identifiers: [] }),
    },
  };

  const gastoRepo   = { findOne: jest.fn().mockResolvedValue(gasto) };
  const detalleRepo = { find:    jest.fn().mockResolvedValue(detalles) };
  const dataSource  = {
    query: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('configuracion'))  return [{ configuracion: null }];
      if (sql.includes('costoPromedio'))  return [{ costoPromedio: String(costo), stock: String(stock) }];
      return [];
    }),
    createQueryRunner: jest.fn().mockReturnValue(qrMock),
  };

  const asientosSvc = opts.asientosSvc ?? {
    asientoGastoImportacion: jest.fn().mockResolvedValue(undefined),
  };

  const service = new GastosImportacionService(
    gastoRepo as any,
    {} as any,
    detalleRepo as any,
    {} as any,
    dataSource as any,
    asientosSvc as any,
    { getEmpresaId: () => EMPRESA } as any,
  );

  return { service, qrMock };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('GastosImportacionService — Caso B: aplicarGastoRetroactivo', () => {

  // ─── 1. FÓRMULA ─────────────────────────────────────────────────────────────

  describe('FÓRMULA: invariante AVCO retroactiva', () => {
    it('costoNuevo = costoActual + montoAsignado / stockActual', () => {
      const costoActual   = 50;
      const stockActual   = 100;
      const cantidadTotal = 20;
      const montoUnitario = 5;
      const montoAsignado = cantidadTotal * montoUnitario;   // 100

      const costoNuevo = Number((costoActual + montoAsignado / stockActual).toFixed(4));

      // Resultado esperado: 50 + 100/100 = 51.00
      expect(costoNuevo).toBe(51.0);

      // Invariante: stock × costoNuevo - stock × costoActual = montoAsignado
      const variacionValorInventario = Number(
        (stockActual * costoNuevo - stockActual * costoActual).toFixed(4),
      );
      expect(variacionValorInventario).toBe(montoAsignado);
    });

    it('la vieja fórmula (costoActual + montoUnitario) sólo coincide cuando stock === cantidadTotal', () => {
      // Si stock=20 y cantidadTotal=20:
      //   nueva: 50 + 100/20 = 55.00
      //   vieja: 50 + 5     = 55.00  ← coinciden solo en este caso especial
      const stock = 20;
      const montoUnitario = 5;
      const montoAsignado = 20 * montoUnitario;

      const nueva = Number((50 + montoAsignado / stock).toFixed(4));
      const vieja = Number((50 + montoUnitario).toFixed(4));
      expect(nueva).toBe(vieja);
    });

    it('diferencia crítica: stock 100, compra 20 → 51.00 (no 55.00)', () => {
      // stock=100 > cantidadTotal=20: la vieja fórmula infla el inventario
      // en 400 DOP extra (100 unidades × 4 DOP de diferencia).
      const correcta = Number((50 + 100 / 100).toFixed(4));
      expect(correcta).toBe(51.0);
      expect(correcta).not.toBe(55.0);
    });
  });

  // ─── 2. REMANENTE ───────────────────────────────────────────────────────────

  describe('REMANENTE: _resolverProrrateoConManuales', () => {
    it('manual 700 en gasto de 1,000 → auto recibe exactamente 300 y suma = 1,000', async () => {
      const gasto = makeGasto({
        montoDOP: 1_000,
        lineas: [makeLinea(DET_A, 700, 70, true)],  // det_A: 700 DOP manual
      });
      // Det_A: ajuste manual. Det_B: automático (50/50 del remanente 300, mismos subtotales)
      const detalles = [
        makeDetalle(DET_A, PROD_A, 10, 500),
        makeDetalle(DET_B, PROD_B,  6, 500),
      ];
      const detalleRepo = { find: jest.fn().mockResolvedValue(detalles) };

      const service = new GastosImportacionService(
        {} as any, {} as any, detalleRepo as any, {} as any, {} as any,
        {} as any, { getEmpresaId: () => EMPRESA } as any,
      );

      const lineas = await (service as any)._resolverProrrateoConManuales(gasto);

      const lineaA = lineas.find((l: any) => l.compraDetalleId === DET_A);
      const lineaB = lineas.find((l: any) => l.compraDetalleId === DET_B);

      expect(lineaA.montoAsignado).toBe(700);
      expect(lineaB.montoAsignado).toBe(300);   // remanente = 1000 − 700 = 300

      const total = lineas.reduce((s: number, l: any) => s + l.montoAsignado, 0);
      expect(total).toBe(1_000);                 // suma exacta
    });

    it('ajuste manual de 1,200 en gasto de 1,000 → BadRequestException con mensaje claro', async () => {
      const gasto = makeGasto({
        montoDOP: 1_000,
        lineas: [makeLinea(DET_A, 1_200, 120, true)],
      });
      const detalleRepo = {
        find: jest.fn().mockResolvedValue([makeDetalle(DET_A, PROD_A, 10, 1_000)]),
      };

      const service = new GastosImportacionService(
        {} as any, {} as any, detalleRepo as any, {} as any, {} as any,
        {} as any, { getEmpresaId: () => EMPRESA } as any,
      );

      await expect(
        (service as any)._resolverProrrateoConManuales(gasto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('montoUnitario siempre derivado de montoAsignado / cantidadTotal (ignora el guardado)', async () => {
      // montoUnitario guardado = 9999 (desfasado); cantidadTotal = 10
      // → montoUnitario correcto = 700 / 10 = 70
      const gasto = makeGasto({
        montoDOP: 1_000,
        lineas: [makeLinea(DET_A, 700, 9_999 /* desfasado */, true)],
      });
      const detalles = [
        makeDetalle(DET_A, PROD_A, 10, 500),
        makeDetalle(DET_B, PROD_B,  6, 500),
      ];
      const detalleRepo = { find: jest.fn().mockResolvedValue(detalles) };

      const service = new GastosImportacionService(
        {} as any, {} as any, detalleRepo as any, {} as any, {} as any,
        {} as any, { getEmpresaId: () => EMPRESA } as any,
      );

      const lineas = await (service as any)._resolverProrrateoConManuales(gasto);
      const lineaA = lineas.find((l: any) => l.compraDetalleId === DET_A);

      // Debe ser 700/10 = 70, no el 9999 guardado
      expect(lineaA.montoUnitario).toBe(70);
    });
  });

  // ─── 3. ROLLBACK ────────────────────────────────────────────────────────────

  describe('ROLLBACK: fallo del asiento → rollback completo', () => {
    it('commitTransaction NO se llama; rollbackTransaction SÍ; error propagado; release siempre', async () => {
      const asientosSvc = {
        asientoGastoImportacion: jest.fn().mockImplementation(
          (_params: any, manager?: any) =>
            manager
              ? Promise.reject(new Error('Cuenta contable 1.1.3.01 no encontrada'))
              : Promise.resolve(),
        ),
      };

      const { service, qrMock } = buildServiceWithQr({ asientosSvc });

      await expect(
        service.aplicarGastoRetroactivo(GASTO_ID, { confirmado: true }, USUARIO),
      ).rejects.toThrow('Cuenta contable 1.1.3.01 no encontrada');

      expect(qrMock.commitTransaction).not.toHaveBeenCalled();
      expect(qrMock.rollbackTransaction).toHaveBeenCalledTimes(1);
      // finally block: release siempre se llama aunque haya error
      expect(qrMock.release).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 4. IDEMPOTENCIA ────────────────────────────────────────────────────────

  describe('IDEMPOTENCIA: gasto ya aplicado', () => {
    it('segunda aplicación rechaza con BadRequestException sin tocar la BD', async () => {
      const service = buildService({ gasto: makeGasto({ estado: EstadoGasto.APLICADO }) });

      await expect(
        service.aplicarGastoRetroactivo(GASTO_ID, { confirmado: true }, USUARIO),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── 5. CONFIRMACIÓN ────────────────────────────────────────────────────────

  describe('CONFIRMACIÓN: condiciones que requieren aprobación explícita', () => {
    it('stock=0 → necesitaConfirmacion:true, aplicado:false, advertencia sobre AVCO', async () => {
      const service = buildService({ stock: 0, costoPromedio: 50 });
      const result  = await service.aplicarGastoRetroactivo(GASTO_ID, {}, USUARIO);

      expect(result.aplicado).toBe(false);
      expect(result.necesitaConfirmacion).toBe(true);
      expect(result.advertencias.some(a => /stock actual 0/i.test(a))).toBe(true);
    });

    it('costoPromedio=0 → necesitaConfirmacion:true, aplicado:false, advertencia sobre costo 0', async () => {
      const service = buildService({ stock: 100, costoPromedio: 0 });
      const result  = await service.aplicarGastoRetroactivo(GASTO_ID, {}, USUARIO);

      expect(result.aplicado).toBe(false);
      expect(result.necesitaConfirmacion).toBe(true);
      expect(result.advertencias.some(a => /costo promedio actual es 0/i.test(a))).toBe(true);
    });

    it('costoPromedio=0 + confirmado:true → aplica (commitTransaction llamado una vez)', async () => {
      const { service, qrMock } = buildServiceWithQr({ stock: 100, costoPromedio: 0 });
      const result = await service.aplicarGastoRetroactivo(GASTO_ID, { confirmado: true }, USUARIO);

      expect(result.aplicado).toBe(true);
      expect(qrMock.commitTransaction).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 6. KARDEX ──────────────────────────────────────────────────────────────

  describe('KARDEX: movimiento con cantidad=0 no altera stock', () => {
    it('el movimiento guardado tiene cantidad=0, cantidadAnterior=cantidadNueva=stock actual', async () => {
      const STOCK = 100;
      const { service, qrMock } = buildServiceWithQr({ stock: STOCK });

      await service.aplicarGastoRetroactivo(GASTO_ID, { confirmado: true }, USUARIO);

      // El único manager.save en el propio aplicarGastoRetroactivo es para Movimiento.
      // (asientosService.asientoGastoImportacion está mockeado y no llama a manager.save)
      const saveCalls = (qrMock.manager.save as jest.Mock).mock.calls;

      // Buscar la llamada que corresponde al movimiento (tiene campo 'cantidad')
      const movCall = saveCalls.find(
        (args: unknown[]) => args.length === 2 && typeof (args[1] as any)?.cantidad !== 'undefined',
      );

      expect(movCall).toBeDefined();
      const movData = movCall![1] as any;
      expect(movData.cantidad).toBe(0);
      expect(movData.cantidadAnterior).toBe(STOCK);
      expect(movData.cantidadNueva).toBe(STOCK);      // stock no cambia
      expect(movData.tipo).toBe(TipoMovimiento.AJUSTE_COSTO_IMPORTACION);
    });

    it('el producto.stock NO se actualiza (solo costoPromedio cambia)', async () => {
      const STOCK = 100;
      const { service, qrMock } = buildServiceWithQr({ stock: STOCK });

      await service.aplicarGastoRetroactivo(GASTO_ID, { confirmado: true }, USUARIO);

      const updateCalls = (qrMock.manager.update as jest.Mock).mock.calls;

      // Buscar llamada a update de Producto
      const prodUpdateCall = updateCalls.find(
        (args: unknown[]) => {
          // args[0] es la clase Producto, args[1] es el id, args[2] es el partial
          const partial = args[2] as any;
          return partial && 'costoPromedio' in partial;
        },
      );

      expect(prodUpdateCall).toBeDefined();
      const partial = prodUpdateCall![2] as any;
      // Solo costoPromedio se actualiza — stock NO aparece en el partial
      expect('stock' in partial).toBe(false);
      expect('costoPromedio' in partial).toBe(true);
    });
  });

});
