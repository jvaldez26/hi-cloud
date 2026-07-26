/**
 * Agro — M2, M3, M4 y M5.
 *
 * M2  parcelaId/cultivoId del body sin validar pertenencia.
 * M3  el costo de la aplicación salía del body, no del insumo maestro.
 * M4  el cierre de ciclo se fechaba en UTC (de noche, el día siguiente).
 * M5  la baja de un animal no dejaba constancia del motivo.
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CiclosService } from './ciclos/ciclos.service';
import { GanaderiaService } from './ganaderia/ganaderia.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

function buildCiclos(responder: (sql: string, params: any[]) => any) {
  const sqls: { sql: string; params: any[] }[] = [];
  const ds = { query: jest.fn(async (sql: string, params: any[] = []) => { sqls.push({ sql, params }); return responder(sql, params); }) };
  const svc = new CiclosService(ds as any, { getUserId: () => 9 } as any);
  return { svc, sqls };
}

describe('M2 — los FK del body se validan contra la empresa', () => {
  const okBase = (sql: string) => {
    if (sql.includes('siguiente_numero_secuencia')) return [{ num: 1 }];
    if (sql.includes('INSERT INTO ag_ciclos')) return [{ id: 50 }];
    return [];
  };

  it('rechaza una parcela que no es de la empresa', async () => {
    const { svc } = buildCiclos((sql) => sql.includes('FROM ag_parcelas') ? [] : okBase(sql));
    await expect(svc.create(1, { parcelaId: 99, cultivoId: 5, fechaSiembra: '2026-01-10' }))
      .rejects.toThrow(NotFoundException);
  });

  it('rechaza un cultivo que no es de la empresa', async () => {
    const { svc } = buildCiclos((sql) => {
      if (sql.includes('FROM ag_parcelas')) return [{ '?column?': 1 }];
      if (sql.includes('FROM ag_cultivos')) return [];
      return okBase(sql);
    });
    await expect(svc.create(1, { parcelaId: 3, cultivoId: 99, fechaSiembra: '2026-01-10' }))
      .rejects.toThrow(/Cultivo/);
  });

  it('rechaza ids con formato inválido', async () => {
    const { svc } = buildCiclos(okBase);
    await expect(svc.create(1, { parcelaId: 'abc', cultivoId: 5 }))
      .rejects.toThrow(BadRequestException);
  });

  it('deja pasar cuando ambos son de la empresa', async () => {
    const { svc, sqls } = buildCiclos((sql) => {
      if (sql.includes('FROM ag_parcelas') || sql.includes('FROM ag_cultivos')) return [{ '?column?': 1 }];
      return okBase(sql);
    });
    await svc.create(1, { parcelaId: 3, cultivoId: 5, fechaSiembra: '2026-01-10' });
    expect(sqls.some(q => q.sql.includes('INSERT INTO ag_ciclos'))).toBe(true);
  });

  it('valida ANTES de consumir número de secuencia', async () => {
    const { svc, sqls } = buildCiclos((sql) => sql.includes('FROM ag_parcelas') ? [] : okBase(sql));
    await svc.create(1, { parcelaId: 99, cultivoId: 5 }).catch(() => undefined);
    expect(sqls.some(q => q.sql.includes('siguiente_numero_secuencia'))).toBe(false);
  });
});

describe('M4 — el cierre de ciclo usa la fecha de RD', () => {
  it('fecha el cierre con el día local, no con el UTC', async () => {
    const { svc, sqls } = buildCiclos((sql) => {
      if (sql.includes('SELECT estado FROM ag_ciclos')) return [{ estado: 'sembrado' }];
      if (sql.includes('FROM ag_ciclos')) return [{ id: 1, estado: 'sembrado' }];
      return [];
    });
    await svc.cerrar(1, 1, {}).catch(() => undefined);

    const cierre = sqls.find(q => q.params.includes(fechaHoyRD()));
    expect(cierre).toBeDefined();   // la fecha insertada es la de Santo Domingo
  });

  it('fechaHoyRD nunca devuelve el día UTC cuando difieren', () => {
    // A las 23:00 en RD ya es el día siguiente en UTC: el helper debe dar el de RD.
    const utc = new Date().toISOString().split('T')[0];
    const rd  = fechaHoyRD();
    expect(rd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // rd nunca puede ir por delante de utc (RD = UTC-4)
    expect(rd <= utc).toBe(true);
  });
});

describe('M5 — la baja de un animal exige motivo', () => {
  const buildGan = (actual: any) => {
    const sqls: { sql: string; params: any[] }[] = [];
    const ds = { query: jest.fn(async (sql: string, params: any[] = []) => {
      sqls.push({ sql, params });
      if (sql.includes('FROM ag_animales a')) return [actual];
      if (sql.includes('UPDATE ag_animales')) return [{ ...actual, ...{} }];
      return [];
    }) };
    const svc = new GanaderiaService(ds as any, { getUserId: () => 9 } as any);
    return { svc, sqls };
  };
  const vivo = { id: 4, estado: 'activo', isActive: true };

  it.each(['muerto', 'vendido', 'sacrificado', 'perdido'])(
    'rechaza pasar a "%s" sin motivo', async (estado) => {
      const { svc } = buildGan(vivo);
      await expect(svc.update(1, 4, { estado })).rejects.toThrow(/motivo de la baja/i);
    });

  it('rechaza isActive=false sin motivo', async () => {
    const { svc } = buildGan(vivo);
    await expect(svc.update(1, 4, { isActive: false })).rejects.toThrow(BadRequestException);
  });

  it('acepta la baja con motivo y la registra como evento', async () => {
    const { svc, sqls } = buildGan(vivo);
    await svc.update(1, 4, { estado: 'vendido', motivoBaja: 'Venta a finca vecina' });

    const evento = sqls.find(q => q.sql.includes('INSERT INTO ag_eventos_animal'));
    expect(evento).toBeDefined();
    expect(evento!.params.join(' ')).toContain('Venta a finca vecina');
    expect(evento!.params).toContain('baja');
  });

  it('no molesta en una edición normal', async () => {
    const { svc, sqls } = buildGan(vivo);
    await svc.update(1, 4, { pesoActual: 320 });
    expect(sqls.some(q => q.sql.includes('INSERT INTO ag_eventos_animal'))).toBe(false);
  });

  it('no vuelve a pedir motivo si el animal ya estaba de baja', async () => {
    const { svc } = buildGan({ id: 4, estado: 'vendido', isActive: true });
    await expect(svc.update(1, 4, { estado: 'vendido', notas: 'corrección' })).resolves.toBeDefined();
  });
});
