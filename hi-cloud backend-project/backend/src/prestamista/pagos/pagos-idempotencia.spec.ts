/**
 * C1 (auditoría Prestamista Etapa 1) — idempotencia de PagosService.registrar().
 *
 * Antes de este fix, un doble clic o un reintento de red en "Registrar Pago"
 * creaba dos filas en pr_pagos y aplicaba el dinero dos veces: el bloqueo
 * FOR UPDATE de las cuotas no lo evitaba (la segunda petición simplemente
 * aplicaba su dinero a la SIGUIENTE cuota pendiente, en vez de chocar con la
 * primera). Mismo patrón de prueba (mocks del QueryRunner, sin Postgres real)
 * que desembolso-transaccional.spec.ts, porque lo que se prueba es el
 * contrato del servicio, no una BD real.
 */
import { PagosService } from './pagos.service';

function buildService(responderDs: (sql: string, params: any[]) => any, responderQr: (sql: string, params: any[]) => any) {
  const vidaQr: string[] = [];
  const qr = {
    connect: jest.fn(async () => { vidaQr.push('connect'); }),
    startTransaction: jest.fn(async () => { vidaQr.push('start'); }),
    commitTransaction: jest.fn(async () => { vidaQr.push('commit'); }),
    rollbackTransaction: jest.fn(async () => { vidaQr.push('rollback'); }),
    release: jest.fn(async () => { vidaQr.push('release'); }),
    query: jest.fn(async (sql: string, params: any[] = []) => responderQr(sql, params)),
  };
  const ds = {
    createQueryRunner: () => qr,
    query: jest.fn(async (sql: string, params: any[] = []) => responderDs(sql, params)),
  };
  const asientos = { asientoPagoPrestamo: jest.fn().mockResolvedValue(undefined) };
  const emitirEcf = { execute: jest.fn().mockResolvedValue(undefined) };
  const tenantSvc = { getUserId: () => 42 };
  const feriadosSvc = { obtenerSetFeriados: jest.fn().mockResolvedValue(new Set()) };
  const svc = new PagosService(ds as any, asientos as any, emitirEcf as any, tenantSvc as any, feriadosSvc as any);
  return { svc, ds, qr, vidaQr };
}

// tipoPago='abono_parcial': se aplica a la cuota pendiente más vieja sin
// exigir una selección explícita — lo más parecido al comportamiento
// anterior a este rediseño, que es lo que estos tests de idempotencia
// necesitan (no están probando la distribución, sino el contrato de la clave).
const DATA = { prestamoId: 5, montoPagado: 500, tipoPago: 'abono_parcial' };
const PRESTAMO_ACTIVO = { id: 5, estado: 'al_dia', deudorId: 3, totalPagado: 0, diasGracia: 0, porcentajeMora: 0 };
const CUOTA_PENDIENTE = {
  id: 1, numeroCuota: 1, fechaVencimiento: '2026-01-01',
  capital: 400, interes: 100, capitalPagado: 0, interesPagado: 0,
  moraGenerada: 0, moraPagada: 0, cargos: null, cargosPagados: 0, totalPagado: 0,
};

describe('C1 — idempotencia de PagosService.registrar()', () => {
  it('con clave ya usada: devuelve el pago existente SIN abrir transacción ni tocar cuotas', async () => {
    const pagoExistente = { id: 900, prestamoId: 5, montoPagado: 500, cuotasAfectadas: [{ cuotaId: 1 }] };
    const { svc, ds, qr } = buildService(
      (sql: string) => {
        if (sql.includes('FROM pr_pagos') && sql.includes('claveIdempotencia')) return [pagoExistente];
        if (sql.includes('FROM pr_prestamos')) return [{ saldoCapital: 100, saldoInteres: 10, saldoMora: 0, saldoTotal: 110 }];
        return [];
      },
      () => { throw new Error('no debería tocar la transacción en un hit de idempotencia'); },
    );

    const res = await svc.registrar(1, { ...DATA, claveIdempotencia: 'clave-ya-usada' });

    expect((res as any).pago).toEqual(pagoExistente);
    expect((res as any).saldos).toEqual({ saldoCapital: 100, saldoInteres: 10, saldoMora: 0, saldoTotal: 110 });
    expect(qr.connect).not.toHaveBeenCalled();
    expect(ds.query).toHaveBeenCalled();
  });

  it('carrera (doble clic): el INSERT choca con 23505 → devuelve la fila ganadora, no revienta con 500', async () => {
    let chequeosPrevios = 0;
    const ganadora = { id: 901, prestamoId: 5, montoPagado: 500, cuotasAfectadas: [] };

    const { svc, qr } = buildService(
      (sql: string) => {
        if (sql.includes('FROM pr_pagos') && sql.includes('claveIdempotencia')) {
          chequeosPrevios += 1;
          // Primer chequeo (antes de abrir transacción): todavía no existe.
          // Segundo chequeo (tras el 23505 en el catch): ya la ganó la otra petición.
          return chequeosPrevios === 1 ? [] : [ganadora];
        }
        return [];
      },
      (sql: string) => {
        if (sql.includes('FROM pr_prestamos WHERE id=')) return [PRESTAMO_ACTIVO];
        if (sql.includes('FROM pr_cuotas') && sql.includes('FOR UPDATE')) return [CUOTA_PENDIENTE];
        if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0001' }];
        if (sql.includes('INSERT INTO pr_pagos')) {
          const err: any = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
        return [];
      },
    );

    const res = await svc.registrar(1, { ...DATA, claveIdempotencia: 'clave-concurrente' });

    expect((res as any).pago).toEqual(ganadora);
    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(qr.release).toHaveBeenCalled();
  });

  it('sin claveIdempotencia: no consulta pr_pagos por clave y sigue el flujo normal (transacción completa)', async () => {
    const { svc, ds, vidaQr } = buildService(
      () => [],
      (sql: string) => {
        if (sql.includes('FROM pr_prestamos WHERE id=')) return [PRESTAMO_ACTIVO];
        if (sql.includes('FROM pr_cuotas') && sql.includes('FOR UPDATE')) return [CUOTA_PENDIENTE];
        if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0002' }];
        if (sql.includes('INSERT INTO pr_pagos')) return [{ id: 902, prestamoId: 5, montoPagado: 500 }];
        if (sql.includes('SUM(GREATEST')) return [{ saldoCapital: 0, saldoInteres: 0, saldoMora: 0, cuotasPendientes: 0, cuotasVencidas: 0 }];
        return [];
      },
    );

    await svc.registrar(1, { ...DATA });

    expect(ds.query).not.toHaveBeenCalledWith(expect.stringContaining('claveIdempotencia'), expect.anything());
    expect(vidaQr).toEqual(['connect', 'start', 'commit', 'release']);
  });
});
