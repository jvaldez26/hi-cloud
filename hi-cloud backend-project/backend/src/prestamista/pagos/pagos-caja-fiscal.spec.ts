/**
 * Prestamista Etapa 5 — ver docs/prestamista/etapa-5-contabilidad-caja-fiscal.md.
 *
 * Parte B: PagosService.registrar() guarda cajaDiariaId en el pago solo
 * cuando el método es efectivo, validando SIEMPRE que la caja pertenezca a
 * esta empresa y esté abierta. Parte C: dispara el e-CF tipo 32 también
 * cuando mora/cargos están configurados en el producto, sin tocar el
 * disparo preexistente por interés.
 *
 * Mismo patrón de mocks del QueryRunner (sin Postgres real) que
 * pagos-idempotencia.spec.ts / pagos-anulacion.spec.ts.
 */
import { BadRequestException } from '@nestjs/common';
import { PagosService } from './pagos.service';

function buildService(responderQr: (sql: string, params: any[]) => any) {
  const qr = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    query: jest.fn(async (sql: string, params: any[] = []) => responderQr(sql, params)),
  };
  const ds = {
    createQueryRunner: () => qr,
    query: jest.fn(async () => []), // chequeo de idempotencia: sin clave, no se usa
  };
  const asientos = { asientoPagoPrestamo: jest.fn().mockResolvedValue(undefined) };
  const emitirEcf = { execute: jest.fn().mockResolvedValue(undefined) };
  const tenantSvc = { getUserId: () => 42 };
  const feriadosSvc = { obtenerSetFeriados: jest.fn().mockResolvedValue(new Set()) };
  const svc = new PagosService(ds as any, asientos as any, emitirEcf as any, tenantSvc as any, feriadosSvc as any);
  return { svc, ds, qr, emitirEcf };
}

const EMPRESA = 1;
const CUOTA_PENDIENTE = {
  id: 1, numeroCuota: 1, fechaVencimiento: '2026-01-01',
  capital: 400, interes: 100, capitalPagado: 0, interesPagado: 0,
  moraGenerada: 50, moraPagada: 0, cargos: null, cargosPagados: 0, totalPagado: 0,
};
const SALDOS = { saldoCapital: 0, saldoInteres: 0, saldoMora: 0, cuotasPendientes: 0, cuotasVencidas: 0 };

function prestamoActivo(motorConfig: any = null) {
  return { id: 5, estado: 'al_dia', deudorId: 3, totalPagado: 0, diasGracia: 0, porcentajeMora: 0, motorConfig };
}

function respuestaBase(opts: {
  prestamo: any; cajaRow?: any[]; empresaRow?: any[];
}) {
  return (sql: string) => {
    if (sql.includes('FROM pr_prestamos WHERE id=')) return [opts.prestamo];
    if (sql.includes('FROM pr_cuotas') && sql.includes('FOR UPDATE')) return [CUOTA_PENDIENTE];
    if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0001' }];
    if (sql.includes('INSERT INTO pr_pagos')) return [{ id: 900, prestamoId: 5, montoPagado: 500 }];
    if (sql.includes('SUM(GREATEST')) return [SALDOS];
    if (sql.includes('FROM empresa')) return opts.empresaRow ?? [{}];
    if (sql.includes('FROM cierres_caja')) return opts.cajaRow ?? [];
    return [];
  };
}

describe('PagosService.registrar — integración con Caja (Etapa 5, Parte B)', () => {
  it('efectivo con cajaDiariaId válido (empresa+caja abierta): lo guarda en el INSERT', async () => {
    const { svc, qr } = buildService(
      respuestaBase({ prestamo: prestamoActivo(), cajaRow: [{ estado: 'abierta' }] }),
    );

    await svc.registrar(EMPRESA, {
      prestamoId: 5, montoPagado: 500, tipoPago: 'abono_parcial', metodoPago: 'efectivo', cajaDiariaId: 9,
    });

    const insert = qr.query.mock.calls.find((c: any) => c[0].includes('INSERT INTO pr_pagos'));
    expect(insert[0]).toContain('"cajaDiariaId"');
    expect(insert[1]).toContain(9);
  });

  it('caja que no pertenece a esta empresa: rechaza con BadRequestException (fuga multi-tenant)', async () => {
    const { svc } = buildService(
      respuestaBase({ prestamo: prestamoActivo(), cajaRow: [] }), // FROM cierres_caja WHERE empresaId=X no encuentra nada
    );

    await expect(svc.registrar(EMPRESA, {
      prestamoId: 5, montoPagado: 500, tipoPago: 'abono_parcial', metodoPago: 'efectivo', cajaDiariaId: 999,
    })).rejects.toThrow(BadRequestException);
  });

  it('caja ya cerrada: rechaza', async () => {
    const { svc } = buildService(
      respuestaBase({ prestamo: prestamoActivo(), cajaRow: [{ estado: 'cerrada' }] }),
    );

    await expect(svc.registrar(EMPRESA, {
      prestamoId: 5, montoPagado: 500, tipoPago: 'abono_parcial', metodoPago: 'efectivo', cajaDiariaId: 9,
    })).rejects.toThrow(BadRequestException);
  });

  it('interruptor de empresa apagado: ignora el cajaDiariaId (guarda null) sin validar la caja', async () => {
    const { svc, qr } = buildService(
      respuestaBase({
        prestamo: prestamoActivo(), empresaRow: [{ configuracion: { prestamoEfectivoPorCaja: false } }],
      }),
    );

    await svc.registrar(EMPRESA, {
      prestamoId: 5, montoPagado: 500, tipoPago: 'abono_parcial', metodoPago: 'efectivo', cajaDiariaId: 9,
    });

    const insert = qr.query.mock.calls.find((c: any) => c[0].includes('INSERT INTO pr_pagos'));
    expect(insert[1]).toContain(null);
    expect(qr.query.mock.calls.some((c: any) => c[0].includes('FROM cierres_caja'))).toBe(false);
  });

  it('metodoPago tarjeta con cajaDiariaId enviado: nunca entra a caja, se guarda null', async () => {
    const { svc, qr } = buildService(
      respuestaBase({ prestamo: prestamoActivo() }),
    );

    await svc.registrar(EMPRESA, {
      prestamoId: 5, montoPagado: 500, tipoPago: 'abono_parcial', metodoPago: 'tarjeta', cajaDiariaId: 9,
    });

    const insert = qr.query.mock.calls.find((c: any) => c[0].includes('INSERT INTO pr_pagos'));
    expect(insert[1][insert[1].length - 1]).toBeNull(); // cajaDiariaId es el último parámetro del INSERT
    expect(qr.query.mock.calls.some((c: any) => c[0].includes('FROM cierres_caja'))).toBe(false);
  });
});

describe('PagosService.registrar — e-CF por concepto (Etapa 5, Parte C)', () => {
  it('sin "Fiscal" configurado en el producto: comportamiento idéntico a antes — solo dispara por interés', async () => {
    const { svc, emitirEcf } = buildService(
      respuestaBase({ prestamo: prestamoActivo(null) }),
    );

    await svc.registrar(EMPRESA, { prestamoId: 5, montoPagado: 500, tipoPago: 'abono_parcial' });

    expect(emitirEcf.execute).toHaveBeenCalledTimes(1); // CUOTA_PENDIENTE.interes=100 > 0
  });

  it('mora configurada con generaComprobante=true: dispara el e-CF aunque el interés de esa cuota sea 0', async () => {
    const cuotaSoloMora = { ...CUOTA_PENDIENTE, interes: 0 };
    const { svc, emitirEcf } = buildService((sql: string) => {
      if (sql.includes('FROM pr_prestamos WHERE id=')) return [prestamoActivo({ fiscal: { mora: { generaComprobante: true, tratamientoItbis: null } } })];
      if (sql.includes('FROM pr_cuotas') && sql.includes('FOR UPDATE')) return [cuotaSoloMora];
      if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0001' }];
      if (sql.includes('INSERT INTO pr_pagos')) return [{ id: 900, prestamoId: 5, montoPagado: 500 }];
      if (sql.includes('SUM(GREATEST')) return [SALDOS];
      return [];
    });

    await svc.registrar(EMPRESA, { prestamoId: 5, montoPagado: 450, tipoPago: 'abono_parcial' });

    expect(emitirEcf.execute).toHaveBeenCalledTimes(1);
  });

  it('mora > 0 pero SIN generaComprobante=true: no dispara (el producto no configuró "Fiscal")', async () => {
    const cuotaSoloMora = { ...CUOTA_PENDIENTE, interes: 0 };
    const { svc, emitirEcf } = buildService((sql: string) => {
      if (sql.includes('FROM pr_prestamos WHERE id=')) return [prestamoActivo(null)];
      if (sql.includes('FROM pr_cuotas') && sql.includes('FOR UPDATE')) return [cuotaSoloMora];
      if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0001' }];
      if (sql.includes('INSERT INTO pr_pagos')) return [{ id: 900, prestamoId: 5, montoPagado: 500 }];
      if (sql.includes('SUM(GREATEST')) return [SALDOS];
      return [];
    });

    await svc.registrar(EMPRESA, { prestamoId: 5, montoPagado: 450, tipoPago: 'abono_parcial' });

    expect(emitirEcf.execute).not.toHaveBeenCalled();
  });
});
