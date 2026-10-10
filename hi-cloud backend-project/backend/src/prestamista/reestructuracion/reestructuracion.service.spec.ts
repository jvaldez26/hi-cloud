/**
 * Reestructuración (§5, Etapa 2 resto) — distinta de refinanciar: el mismo
 * préstamo sigue existiendo, solo cambia el plan de las cuotas totalmente
 * pendientes. Mismo patrón de mocks que desembolso-transaccional.spec.ts.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReestructuracionService } from './reestructuracion.service';

function buildQueryRunner(responder: (sql: string, params: any[]) => any) {
  const vida: string[] = [];
  const sqls: string[] = [];
  const qr = {
    connect:            jest.fn(async () => { vida.push('connect'); }),
    startTransaction:   jest.fn(async () => { vida.push('start'); }),
    commitTransaction:  jest.fn(async () => { vida.push('commit'); }),
    rollbackTransaction: jest.fn(async () => { vida.push('rollback'); }),
    release:            jest.fn(async () => { vida.push('release'); }),
    query: jest.fn(async (sql: string, params: any[] = []) => { sqls.push(sql); return responder(sql, params); }),
  };
  return { qr, vida, sqls };
}

const MOTOR_CONFIG = {
  frecuencia: 'mensual',
  tasa: { valor: 0.02, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
  metodo: 'frances',
  mora: { base: 'cuota_vencida', tasaOMonto: 2, baseDiasMora: 360 },
};

const PRESTAMO = {
  id: 20, estado: 'al_dia', motorVersion: 'v2', motorConfig: MOTOR_CONFIG,
  plazoMeses: 6, porcentajeMora: 2, diasGracia: 0,
};

// Fechas bien al futuro de "hoy" (fechaHoyRD(), usada como origen del
// recálculo) para que el motor nunca vea un primer pago anterior al
// desembolso — eso rompería el solver de TIR con un flujo degenerado.
const CUOTAS_PENDIENTES = [
  { id: 101, numeroCuota: 4, fechaVencimiento: '2099-01-01', capital: 1000, interes: 50, capitalPagado: 0, interesPagado: 0 },
  { id: 102, numeroCuota: 5, fechaVencimiento: '2099-02-01', capital: 1000, interes: 40, capitalPagado: 0, interesPagado: 0 },
  { id: 103, numeroCuota: 6, fechaVencimiento: '2099-03-01', capital: 1000, interes: 30, capitalPagado: 0, interesPagado: 0 },
];

function construir(responder: any) {
  const { qr, vida, sqls } = buildQueryRunner(responder);
  const svc = new ReestructuracionService(
    { createQueryRunner: () => qr } as any,
    { obtenerSetFeriados: jest.fn().mockResolvedValue(new Set()) } as any,
  );
  return { svc, qr, vida, sqls };
}

const responderOk = (sql: string) => {
  if (sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE')) return [PRESTAMO];
  if (sql.includes('FROM pr_cuotas') && sql.includes("estado<>'pagada'")) return CUOTAS_PENDIENTES;
  if (sql.includes('SELECT COUNT(*)')) return [{ total: 6 }];
  if (sql.includes('UPDATE pr_prestamos SET')) return [{ ...PRESTAMO, id: 20 }];
  return [];
};

const USUARIO = { id: 1, nombre: 'Jean Admin' };

describe('ReestructuracionService.reestructurar', () => {
  it('reemplaza las cuotas totalmente pendientes y actualiza el préstamo — commit y liberación', async () => {
    const { svc, vida } = construir(responderOk);
    const r: any = await svc.reestructurar(7, 20, { nuevoPlazoMeses: 12, nuevaTasaInteresMensual: 1.5, motivo: 'El deudor pidió extender el plazo' }, USUARIO);

    expect(vida).toEqual(['connect', 'start', 'commit', 'release']);
    expect(r.cuotasReemplazadas).toBe(3);
    expect(r.cuotasNuevas).toBe(12);
  });

  it('borra exactamente las cuotas totalmente pendientes, ninguna más', async () => {
    const { svc, qr } = construir(responderOk);
    await svc.reestructurar(7, 20, { motivo: 'Ajuste' }, USUARIO);
    const del = qr.query.mock.calls.find(([sql]: any[]) => sql.includes('DELETE FROM pr_cuotas'));
    expect(del[1]).toEqual([[101, 102, 103]]);
  });

  it('sin nuevoPlazoMeses: mantiene el mismo número de cuotas pendientes', async () => {
    const { svc, qr } = construir(responderOk);
    await svc.reestructurar(7, 20, { motivo: 'Solo cambia la tasa' }, USUARIO);
    const inserts = qr.query.mock.calls.filter(([sql]: any[]) => sql.includes('INSERT INTO pr_cuotas'));
    expect(inserts).toHaveLength(3);
  });

  it.each(['cancelado', 'pagado', 'refinanciado'])('no reestructura un préstamo %s', async (estado) => {
    const { svc, vida } = construir((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [{ ...PRESTAMO, estado }] : responderOk(sql));
    await expect(svc.reestructurar(7, 20, { motivo: 'x' }, USUARIO)).rejects.toThrow(BadRequestException);
    expect(vida).toContain('rollback');
  });

  it('no reestructura un préstamo con desembolso pendiente (§4)', async () => {
    const { svc } = construir((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [{ ...PRESTAMO, estado: 'desembolso_parcial' }] : responderOk(sql));
    await expect(svc.reestructurar(7, 20, { motivo: 'x' }, USUARIO)).rejects.toThrow(/desembolso pendiente/);
  });

  it('no reestructura un préstamo del motor v1 (sin motorConfig)', async () => {
    const { svc } = construir((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [{ ...PRESTAMO, motorVersion: 'v1', motorConfig: null }] : responderOk(sql));
    await expect(svc.reestructurar(7, 20, { motivo: 'x' }, USUARIO)).rejects.toThrow(/motor v2/);
  });

  it('sin cuotas totalmente pendientes (todas con algún pago): se rechaza', async () => {
    const { svc } = construir((sql: string) =>
      sql.includes('FROM pr_cuotas') && sql.includes("estado<>'pagada'")
        ? [{ ...CUOTAS_PENDIENTES[0], capitalPagado: 100 }]
        : responderOk(sql));
    await expect(svc.reestructurar(7, 20, { motivo: 'x' }, USUARIO)).rejects.toThrow(/totalmente pendientes/);
  });

  it('préstamo inexistente: NotFoundException', async () => {
    const { svc } = construir((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [] : responderOk(sql));
    await expect(svc.reestructurar(7, 20, { motivo: 'x' }, USUARIO)).rejects.toThrow(NotFoundException);
  });

  it('si falla insertando una cuota nueva, hace rollback (todo o nada)', async () => {
    let inserts = 0;
    const { svc, vida } = construir((sql: string) => {
      if (sql.includes('INSERT INTO pr_cuotas') && ++inserts === 2) throw new Error('BD caída');
      return responderOk(sql);
    });
    await expect(svc.reestructurar(7, 20, { motivo: 'x' }, USUARIO)).rejects.toThrow('BD caída');
    expect(vida).toEqual(['connect', 'start', 'rollback', 'release']);
  });
});
