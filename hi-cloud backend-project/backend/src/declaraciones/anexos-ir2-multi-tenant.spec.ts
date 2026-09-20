/**
 * Regresión — aislamiento multi-tenant de las 5 queries de AnexosIR2Service.
 *
 * Antes de FIX 3 Commit 3, ninguna de las 5 tenía esta cobertura (a
 * diferencia de balance-comprobacion.service.spec.ts / saldos-cuentas.
 * service.spec.ts, que sí la tenían desde antes). Hallazgo aparte del bug de
 * agregación (ver anexos-ir2-paso0.spec.ts): el filtro `ac."empresaId" = $1`
 * vivía SOLO dentro del ON del LEFT JOIN mal ubicado — sin ningún WHERE ni
 * INNER JOIN que también lo exigiera — así que un asiento huérfano de otra
 * empresa (si alguna vez existiera, por un bug de otra capa) habría podido
 * colarse en el saldo de un anexo fiscal. El catálogo de cuentas (cc) SÍ
 * estaba bien filtrado en el WHERE en las 5 — ese lado nunca tuvo el hueco.
 *
 * COBERTURA por cada una de las 5 queries:
 * 1. El catálogo de cuentas (cc) va filtrado por empresaId en el WHERE.
 * 2. Los asientos (ac) van filtrados por empresaId dentro de un INNER JOIN
 *    real (ya no un LEFT JOIN) — el fix de FIX 3 Commit 3.
 * 3. Sin "OR ... IS NULL" que deje pasar huérfanos de otra empresa.
 * 4. Empresas distintas reciben su propio empresaId como parámetro.
 */

import { AnexosIR2Service } from './anexos-ir2.service';

interface QueryCapturada { sql: string; params: unknown[] }

function makeService(empresaId: number, captured: QueryCapturada[]) {
  const query = (sql: string, params: unknown[] = []) => {
    captured.push({ sql, params });
    return Promise.resolve([]);
  };
  const svc: any = Object.create(AnexosIR2Service.prototype);
  svc.dataSource = { query };
  svc.tenantSvc = { getEmpresaId: () => empresaId };
  return svc as AnexosIR2Service;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Encuentra, entre las queries capturadas, la que contiene el marcador dado. */
function buscar(captured: QueryCapturada[], marcador: string): QueryCapturada {
  const q = captured.find(c => c.sql.includes(marcador));
  if (!q) throw new Error(`No se capturó ninguna query con el marcador "${marcador}"`);
  return q;
}

describe('AnexosIR2Service — aislamiento multi-tenant (las 5 queries)', () => {
  const CASOS: Array<{
    nombre: string; marcador: string;
    ejecutar: (svc: AnexosIR2Service) => Promise<unknown>;
  }> = [
    // Marcadores elegidos para ser ÚNICOS entre las queries que se disparan
    // JUNTAS en la misma llamada pública (getAnexoA1/getAnexoB1 corren dos
    // queries cada uno vía Promise.all) — nunca ambigüedad de cuál capturó.
    { nombre: 'cuentasConAnexoA1',
      marcador: `JOIN cuenta_anexo_ir2 ca ON ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'A1'`,
      ejecutar: svc => svc.getAnexoA1('2026-12-31') },
    { nombre: 'cuentasDeBalanceSinAnexoA1',
      marcador: `cc.tipo IN ('activo', 'pasivo', 'patrimonio')`,
      ejecutar: svc => svc.getAnexoA1('2026-12-31') },
    { nombre: 'cuentasConAnexoB1',
      marcador: `JOIN cuenta_anexo_ir2 ca ON ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'B1'`,
      ejecutar: svc => svc.getAnexoB1('2026-01-01', '2026-12-31') },
    { nombre: 'cuentasDeResultadosSinAnexoB1',
      marcador: `cc.tipo IN ('ingreso', 'costo', 'gasto')`,
      ejecutar: svc => svc.getAnexoB1('2026-01-01', '2026-12-31') },
    { nombre: 'saldoCuentasInventarioD',
      marcador: `ca."anexoIR2" = 'D'`,
      ejecutar: svc => svc.getAnexoD(2026) },
  ];

  for (const caso of CASOS) {
    describe(caso.nombre, () => {
      it('filtra el catálogo de cuentas (cc) por empresaId en el WHERE', async () => {
        const captured: QueryCapturada[] = [];
        await caso.ejecutar(makeService(7, captured));

        const q = buscar(captured, caso.marcador);
        const sql = norm(q.sql);
        expect(sql).toContain('cc."empresaId" = $1');
      });

      it('filtra los asientos (ac) por empresaId dentro de un INNER JOIN real, no de un LEFT JOIN', async () => {
        const captured: QueryCapturada[] = [];
        await caso.ejecutar(makeService(7, captured));

        const q = buscar(captured, caso.marcador);
        const sql = norm(q.sql);
        expect(sql).not.toContain('LEFT JOIN asientos_contables');
        expect(sql).toContain('JOIN asientos_contables ac');
        const tramoJoin = sql.slice(sql.indexOf('JOIN asientos_contables ac'), sql.indexOf('WHERE al."isActive"'));
        expect(tramoJoin).toContain('ac."empresaId" = $1');
        expect(tramoJoin).toContain(`ac.estado = 'contabilizado'`);
        expect(tramoJoin).toContain('ac."isActive" = true');
      });

      it('no deja pasar cuentas o asientos huérfanos (empresaId IS NULL) de otra empresa', async () => {
        const captured: QueryCapturada[] = [];
        await caso.ejecutar(makeService(7, captured));

        const q = buscar(captured, caso.marcador);
        const sql = norm(q.sql);
        expect(sql).not.toContain('IS NULL');
        expect(sql).not.toMatch(/OR\s+ac\."empresaId"/i);
        expect(sql).not.toMatch(/OR\s+cc\."empresaId"/i);
      });

      it('empresas distintas reciben su propio empresaId', async () => {
        const capA: QueryCapturada[] = [];
        const capB: QueryCapturada[] = [];
        await caso.ejecutar(makeService(7, capA));
        await caso.ejecutar(makeService(42, capB));

        expect(buscar(capA, caso.marcador).params[0]).toBe(7);
        expect(buscar(capB, caso.marcador).params[0]).toBe(42);
      });
    });
  }
});
