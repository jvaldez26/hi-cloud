/**
 * Revertir un recibo de cobro y luego anular la CxC deja el balance en cero.
 *
 * Es la salida que se le da al usuario cuando cxc.service.ts:anular()
 * rechaza una cuenta con abonos aplicados (ver
 * cxc/anular-revierte-asiento.spec.ts): primero revertir el recibo
 * (recibos-cobro.service.ts:eliminar → asientoReversion), lo que deja
 * montoPagado en 0 otra vez; luego anular la CxC (revertirAsiento sobre el
 * asiento de la factura). Este test verifica la matemática contable
 * completa de esa secuencia: factura + cobro + reversa de cobro + reversa
 * de venta, sumadas, dejan cero en las 4 cuentas involucradas.
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { TipoOrigenAsiento, EstadoAsiento } from '../entities/asiento-contable.entity';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

/** Fake con estado real: guarda cada asiento creado y sus líneas, y resuelve
 * revertirAsiento buscando por tipoOrigen+referenciaId+empresaId como lo
 * haría TypeORM. */
function makeService(opts: { empresaId: number; cuentas: any[] }) {
  const asientos: any[] = [];
  const lineasGuardadas: any[] = [];
  let nextId = 1;

  const cuentaRepository = { find: jest.fn().mockResolvedValue(opts.cuentas) };

  const asientoRepository = {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      const row = { id: nextId++, lineas: [], ...data };
      asientos.push(row);
      return row;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      if (typeof where.asientoRevertidoId === 'number') {
        return asientos.find(a =>
          a.asientoRevertidoId === where.asientoRevertidoId &&
          (where.empresaId === undefined || a.empresaId === where.empresaId),
        ) ?? null;
      }
      return asientos.find(a =>
        a.tipoOrigen === where.tipoOrigen &&
        a.referenciaId === where.referenciaId &&
        a.estado === where.estado &&
        (a.asientoRevertidoId === undefined || a.asientoRevertidoId === null) &&
        (where.empresaId === undefined || a.empresaId === where.empresaId),
      ) ?? null;
    }),
  };

  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save: jest.fn(async (data: any) => {
      const arr = Array.isArray(data) ? data : [data];
      lineasGuardadas.push(...arr);
      for (const l of arr) {
        const asiento = asientos.find(a => a.id === l.asientoId);
        if (asiento) asiento.lineas.push(l);
      }
      return data;
    }),
  };

  const tenantService = { getEmpresaId: () => opts.empresaId, getUserId: () => 5 };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc, lineasGuardadas };
}

function sumarPorCuenta(lineas: any[]) {
  const acc: Record<number, { debe: number; haber: number }> = {};
  for (const l of lineas) {
    acc[l.cuentaContableId] ??= { debe: 0, haber: 0 };
    acc[l.cuentaContableId].debe  += Number(l.debe);
    acc[l.cuentaContableId].haber += Number(l.haber);
  }
  return acc;
}

const CLIENTES = 1, VENTAS = 2, ITBIS = 3, BANCOS = 4;
const CUENTAS = [
  cuenta('1.1.2.01', CLIENTES), cuenta('4.1.1.01', VENTAS),
  cuenta('2.1.2.01', ITBIS),    cuenta('1.1.1.03', BANCOS),
];

it('revertir el recibo y luego anular la CxC deja el balance en cero', async () => {
  const { svc, lineasGuardadas } = makeService({ empresaId: 7, cuentas: CUENTAS });

  // Venta a crédito: Debe Clientes 1180 / Haber Ventas 1000 + ITBIS 180.
  await svc.asientoFacturaEmitida(10, 1180, 1000, 180, 'FAC-10', 5);
  // Abono de 400 contra la CxC #50: Debe Bancos 400 / Haber Clientes 400.
  await svc.asientoCobro(400, 50, 5);

  // El usuario revierte el recibo (recibos-cobro.service.ts:eliminar):
  // Debe Clientes 400 / Haber Bancos 400 — deja montoPagado en 0 otra vez.
  await svc.asientoReversion(400, 50, 99, 'recibo', 5);

  // Con la cuenta ya sin abonos, anular la CxC revierte el asiento de venta:
  // Debe Ventas 1000 + ITBIS 180 / Haber Clientes 1180.
  const reversaFactura = await svc.revertirAsiento(
    TipoOrigenAsiento.FACTURA, 10, '2026-09-10', 'Anulación de CxC #50',
  );

  expect(reversaFactura).not.toBeNull();
  expect(reversaFactura.estado).toBe(EstadoAsiento.CONTABILIZADO);

  const saldos = sumarPorCuenta(lineasGuardadas);
  for (const id of [CLIENTES, VENTAS, ITBIS, BANCOS]) {
    expect(saldos[id].debe - saldos[id].haber).toBeCloseTo(0, 2);
  }
});
