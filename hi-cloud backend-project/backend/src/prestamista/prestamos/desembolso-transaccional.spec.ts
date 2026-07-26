/**
 * C2 / H2 — Atomicidad del desembolso y del refinanciamiento.
 *
 * Ambos hacían 6-8 escrituras sueltas. Un fallo a mitad dejaba estados
 * imposibles: un préstamo sin todas sus cuotas pero con el deudor ya
 * actualizado, o un préstamo original cerrado sin el nuevo que lo sustituye
 * (deuda desaparecida).
 *
 * Se prueba el contrato con el QueryRunner: que abra transacción, que haga
 * commit al terminar bien, rollback al fallar, y que libere siempre la conexión.
 */

import { BadRequestException } from '@nestjs/common';
import { PrestamosService } from './prestamos.service';
import { RefinanciamientoService } from '../refinanciamiento/refinanciamiento.service';

/** QueryRunner simulado que registra el ciclo de vida de la transacción. */
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

const DATOS_PRESTAMO = {
  solicitudId: 5, deudorId: 3, montoPrincipal: 12000,
  tasaInteresMensual: 3, plazoMeses: 6, fechaPrimerPago: '2026-09-01',
};

describe('C2 — el desembolso es atómico', () => {
  const construir = (responder: any) => {
    const { qr, vida, sqls } = buildQueryRunner(responder);
    // Tras el commit, create() relee el préstamo con findOne() usando el
    // DataSource (fuera de la transacción), así que el doble debe responder.
    const ds = {
      createQueryRunner: () => qr,
      query: jest.fn(async (sql: string) =>
        sql.includes('FROM pr_prestamos') ? [{ id: 77, numero: 'PRE-0001' }] : []),
    };
    const svc = new PrestamosService(
      ds as any,
      { asientoDesembolsoPrestamo: jest.fn().mockResolvedValue(undefined) } as any,
      { getUserId: () => 42 } as any,
    );
    return { svc, qr, vida, sqls };
  };

  const responderOk = (sql: string) => {
    if (sql.includes('FROM pr_solicitudes')) return [{ id: 5, estado: 'aprobada', deudorId: 3 }];
    if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0001' }];
    if (sql.includes('INSERT INTO pr_prestamos')) return [{ id: 77 }];
    return [];
  };

  it('abre transacción, hace commit y libera la conexión', async () => {
    const { svc, vida } = construir(responderOk);
    await svc.create(1, { ...DATOS_PRESTAMO });
    expect(vida).toEqual(['connect', 'start', 'commit', 'release']);
  });

  it('inserta el préstamo y TODAS sus cuotas dentro de la misma transacción', async () => {
    const { svc, sqls } = construir(responderOk);
    await svc.create(1, { ...DATOS_PRESTAMO });
    expect(sqls.filter(s => s.includes('INSERT INTO pr_prestamos'))).toHaveLength(1);
    expect(sqls.filter(s => s.includes('INSERT INTO pr_cuotas'))).toHaveLength(6); // plazoMeses
  });

  it('si falla insertando una cuota, hace rollback y no deja nada a medias', async () => {
    let cuotas = 0;
    const { svc, vida } = construir((sql: string) => {
      if (sql.includes('INSERT INTO pr_cuotas') && ++cuotas === 3) throw new Error('BD caída');
      return responderOk(sql);
    });
    await expect(svc.create(1, { ...DATOS_PRESTAMO })).rejects.toThrow('BD caída');
    expect(vida).toEqual(['connect', 'start', 'rollback', 'release']);
  });

  it('libera la conexión aunque falle al inicio', async () => {
    const { svc, vida } = construir(() => { throw new Error('sin conexión'); });
    await expect(svc.create(1, { ...DATOS_PRESTAMO })).rejects.toThrow();
    expect(vida).toContain('release');
  });

  describe('doble desembolso de la misma solicitud', () => {
    it('rechaza una solicitud ya desembolsada', async () => {
      const { svc } = construir((sql: string) =>
        sql.includes('FROM pr_solicitudes') ? [{ id: 5, estado: 'desembolsada' }] : responderOk(sql));
      await expect(svc.create(1, { ...DATOS_PRESTAMO }))
        .rejects.toThrow(BadRequestException);
    });

    it('el mensaje explica que ya fue desembolsada', async () => {
      const { svc } = construir((sql: string) =>
        sql.includes('FROM pr_solicitudes') ? [{ id: 5, estado: 'desembolsada' }] : responderOk(sql));
      await svc.create(1, { ...DATOS_PRESTAMO }).catch((e: Error) => {
        expect(e.message).toMatch(/desembolsarse de nuevo/i);
      });
    });

    it('bloquea la solicitud con FOR UPDATE al leerla', async () => {
      const { svc, sqls } = construir(responderOk);
      await svc.create(1, { ...DATOS_PRESTAMO });
      const lectura = sqls.find(s => s.includes('FROM pr_solicitudes'));
      expect(lectura).toContain('FOR UPDATE');
    });

    it('valida la solicitud aunque el body traiga todos los parámetros', async () => {
      // El bug: solo se miraba la solicitud si faltaban datos en el body.
      const { svc, sqls } = construir(responderOk);
      await svc.create(1, { ...DATOS_PRESTAMO, montoPrincipal: 9999, plazoMeses: 3, tasaInteresMensual: 2 });
      expect(sqls.some(s => s.includes('FROM pr_solicitudes'))).toBe(true);
    });

    it('rechaza una solicitud aún pendiente', async () => {
      const { svc } = construir((sql: string) =>
        sql.includes('FROM pr_solicitudes') ? [{ id: 5, estado: 'pendiente' }] : responderOk(sql));
      await expect(svc.create(1, { ...DATOS_PRESTAMO })).rejects.toThrow(/pendiente/);
    });
  });
});

describe('H2 — el refinanciamiento es atómico', () => {
  const construir = (responder: any) => {
    const { qr, vida, sqls } = buildQueryRunner(responder);
    const svc = new RefinanciamientoService(
      { createQueryRunner: () => qr, query: jest.fn(async () => []) } as any,
      { getUserId: () => 42 } as any,
    );
    return { svc, qr, vida, sqls };
  };

  const original = {
    id: 10, estado: 'al_dia', deudorId: 3, tasaInteresMensual: 3, plazoMeses: 6,
    saldoCapital: 8000, saldoInteres: 500, saldoMora: 0, porcentajeMora: 5, diasGracia: 5,
    frecuenciaPago: 'mensual',
  };
  const responderOk = (sql: string) => {
    if (sql.includes('FROM pr_prestamos')) return [original];
    if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0002' }];
    if (sql.includes('INSERT INTO pr_prestamos')) return [{ id: 99 }];
    if (sql.includes('INSERT INTO pr_refinanciamientos')) return [{ id: 5 }];
    return [];
  };

  it('commit y liberación al terminar bien', async () => {
    const { svc, vida } = construir(responderOk);
    await svc.refinanciar(1, { prestamoOriginalId: 10 });
    expect(vida).toEqual(['connect', 'start', 'commit', 'release']);
  });

  it('bloquea el préstamo original con FOR UPDATE', async () => {
    const { svc, sqls } = construir(responderOk);
    await svc.refinanciar(1, { prestamoOriginalId: 10 });
    expect(sqls.find(s => s.includes('FROM pr_prestamos'))).toContain('FOR UPDATE');
  });

  it('si falla creando el préstamo nuevo, el original NO queda cerrado', async () => {
    const { svc, vida } = construir((sql: string) => {
      if (sql.includes('INSERT INTO pr_prestamos')) throw new Error('BD caída');
      return responderOk(sql);
    });
    await expect(svc.refinanciar(1, { prestamoOriginalId: 10 })).rejects.toThrow('BD caída');
    // El UPDATE que lo cerraba se revierte con la transacción
    expect(vida).toEqual(['connect', 'start', 'rollback', 'release']);
  });

  it('M4 — no refinancia un préstamo ya refinanciado', async () => {
    const { svc, vida } = construir((sql: string) =>
      sql.includes('FROM pr_prestamos') ? [{ ...original, estado: 'refinanciado' }] : responderOk(sql));
    await expect(svc.refinanciar(1, { prestamoOriginalId: 10 }))
      .rejects.toThrow(/ya fue refinanciado/i);
    expect(vida).toContain('rollback');
  });

  it.each(['pagado', 'cancelado'])('no refinancia un préstamo %s', async (estado) => {
    const { svc } = construir((sql: string) =>
      sql.includes('FROM pr_prestamos') ? [{ ...original, estado }] : responderOk(sql));
    await expect(svc.refinanciar(1, { prestamoOriginalId: 10 })).rejects.toThrow(BadRequestException);
  });
});
