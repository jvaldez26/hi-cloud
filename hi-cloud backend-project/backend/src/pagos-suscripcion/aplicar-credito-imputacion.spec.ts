import { PagosSuscripcionService } from './pagos-suscripcion.service';
import { PagoAplicacion } from './entities/pago-aplicacion.entity';

/**
 * "Imputación obligatoria" (pedido explícito, 2026-10-06): todo pago
 * registrado desde el panel de Cobros se aplica automáticamente a lo más
 * antiguo que se deba (cargos pendientes y luego períodos vencidos), o el
 * admin elige a qué aplicarlo — nunca un pago suelto sin aplicar.
 *
 * aplicarCredito() SIN cargoId iba siempre directo al abono general, aunque
 * hubiera cargos pendientes o suscripción vencida esperando — exactamente
 * el patrón que dejó dinero "parqueado" sin tocar deuda nueva (empresa MOTO
 * REPUESTO MANOLIN SRL). Este test prueba el fix: ahora pasa por el MISMO
 * motor que un pago real (calcularImputacion/aplicarResultadoImputacion).
 */

const EMPRESA = 42;

function montar(opts: {
  cargosPendientes?: Array<{ id: number; concepto: string; monto: number; montoPagado: number }>;
  sus?: any;
} = {}) {
  const pagosGuardados: any[] = [];
  const aplicacionesInsertadas: any[] = [];
  const updatesPagos: Array<{ sql: string; params: any[] }> = [];
  const updatesSuscripciones: Array<{ sql: string; params: any[] }> = [];

  const pagoRepoFalso = {
    create: (x: any) => x,
    save:   async (x: any) => { const row = { id: pagosGuardados.length + 1, ...x }; pagosGuardados.push(row); return row; },
  };
  const aplicacionRepoFalso = {
    insert: async (x: any) => { aplicacionesInsertadas.push(x); },
  };

  const susDefault = opts.sus ?? {
    plan: 'pro', estado: 'activa', modalidad: 'mensual',
    fechaVencimiento: '2099-01-01', diaCorte: 5, abonoDisponible: '0.00', precio: 5200,
  };

  // calcularImputacion() hace dos SELECT por `runner.query`: la suscripción,
  // luego los cargos pendientes (FIFO) — este fake responde según el SQL.
  const manager: any = {
    getRepository: (entity: any) => (entity === PagoAplicacion ? aplicacionRepoFalso : pagoRepoFalso),
    query: async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM suscripciones s')) return [susDefault];
      if (sql.includes("tipo = 'CARGO'") && sql.includes('AND monto > "montoPagado"')) {
        return opts.cargosPendientes ?? [];
      }
      if (sql.includes('UPDATE pagos_suscripcion')) { updatesPagos.push({ sql, params }); return undefined; }
      if (sql.includes('UPDATE suscripciones')) { updatesSuscripciones.push({ sql, params }); return undefined; }
      // SELECT id, monto, montoPagado de UN cargo específico (dto.cargoId)
      if (sql.trim().startsWith('SELECT id, monto, "montoPagado"')) {
        const cargo = (opts.cargosPendientes ?? []).find(c => c.id === params[0]);
        return cargo ? [cargo] : [];
      }
      return [];
    },
  };

  const ds: any = { transaction: async (cb: any) => cb(manager) };

  const svc = new PagosSuscripcionService(
    pagoRepoFalso as any, {} as any, aplicacionRepoFalso as any, ds, {} as any, {} as any, {} as any, {} as any,
  );
  return { svc, pagosGuardados, aplicacionesInsertadas, updatesPagos, updatesSuscripciones };
}

describe('aplicarCredito() — imputación obligatoria', () => {
  it('SIN cargoId y CON cargos pendientes: el crédito liquida el cargo más antiguo, no va directo al abono', async () => {
    const { svc, aplicacionesInsertadas, updatesPagos, updatesSuscripciones } = montar({
      cargosPendientes: [{ id: 85, concepto: 'ECF', monto: 4800, montoPagado: 0 }],
    });

    await svc.aplicarCredito(EMPRESA, { concepto: 'Crédito de cortesía', monto: 4800 } as any, 1);

    expect(updatesPagos).toHaveLength(1);
    expect(updatesPagos[0].params).toEqual([4800, 85]);
    expect(aplicacionesInsertadas).toHaveLength(1);
    expect(aplicacionesInsertadas[0]).toMatchObject({ empresaId: EMPRESA, cargoId: 85, montoAplicado: 4800 });
    // El abono final queda en 0: el crédito completo se consumió en el cargo, nada sobró.
    const abono = updatesSuscripciones.find(u => u.sql.includes('"abonoDisponible" = $1'));
    expect(abono).toBeDefined();
    expect(abono!.params).toEqual([0, EMPRESA]);
  });

  it('SIN cargoId, SIN cargos pendientes, CON suscripción vencida: avanza el período en vez de ir directo a abono', async () => {
    const { svc, updatesSuscripciones } = montar({
      cargosPendientes: [],
      sus: { plan: 'pro', estado: 'activa', modalidad: 'mensual', fechaVencimiento: '2020-01-05', diaCorte: 5, abonoDisponible: '0.00', precio: 5200 },
    });

    await svc.aplicarCredito(EMPRESA, { concepto: 'Crédito', monto: 5200 } as any, 1);

    const avanceSuscripcion = updatesSuscripciones.find(u => u.sql.includes('"fechaVencimiento" = $1'));
    expect(avanceSuscripcion).toBeDefined();
  });

  it('SIN cargoId, sin nada que deber: el remanente SÍ queda como abono (comportamiento correcto, no un bug)', async () => {
    const { svc, updatesSuscripciones } = montar({
      cargosPendientes: [],
      sus: { plan: 'pro', estado: 'activa', modalidad: 'mensual', fechaVencimiento: '2099-01-01', diaCorte: 5, abonoDisponible: '0.00', precio: 5200 },
    });

    await svc.aplicarCredito(EMPRESA, { concepto: 'Crédito pequeño', monto: 100 } as any, 1);

    const abono = updatesSuscripciones.find(u => u.sql.includes('"abonoDisponible" = $1'));
    expect(abono).toBeDefined();
    expect(abono!.params).toEqual([100, EMPRESA]);
  });

  it('CON cargoId: el admin eligió ese cargo específico — se aplica ahí y queda registrado en pagos_aplicaciones', async () => {
    const { svc, aplicacionesInsertadas, updatesPagos } = montar({
      cargosPendientes: [{ id: 85, concepto: 'ECF', monto: 4800, montoPagado: 0 }],
    });

    await svc.aplicarCredito(EMPRESA, { concepto: 'Crédito dirigido', monto: 4800, cargoId: 85 } as any, 1);

    expect(updatesPagos).toHaveLength(1);
    expect(aplicacionesInsertadas).toHaveLength(1);
    expect(aplicacionesInsertadas[0]).toMatchObject({ cargoId: 85, montoAplicado: 4800 });
  });

  it('CON cargoId y crédito mayor al saldo del cargo: el excedente va al abono general', async () => {
    const { svc, updatesSuscripciones } = montar({
      cargosPendientes: [{ id: 85, concepto: 'ECF', monto: 4800, montoPagado: 0 }],
    });

    await svc.aplicarCredito(EMPRESA, { concepto: 'Crédito grande', monto: 5000, cargoId: 85 } as any, 1);

    // El camino "cargoId elegido" incrementa el abono (+ $1), a diferencia
    // del motor automático (que reemplaza con el abonoFinal ya calculado).
    const abono = updatesSuscripciones.find(u => u.sql.includes('"abonoDisponible" = "abonoDisponible" + $1'));
    expect(abono).toBeDefined();
    expect(abono!.params).toEqual([200, EMPRESA]); // 5000 - 4800
  });
});
