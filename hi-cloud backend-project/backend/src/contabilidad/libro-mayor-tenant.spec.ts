/**
 * Regresion P0 — FUGA CROSS-TENANT en el Libro Mayor (2026-09-23).
 *
 * Sintoma que lo destapo: una empresa recien creada, con dos facturas y una
 * nota de credito, mostraba en el mayor de 2.1.2.01 cinco lineas "Reversa
 * ITBIS — NC NC-181..185" que no eran suyas.
 *
 * Causa: getLibroMayor() filtraba solo por cuentaContableId. Ni la linea ni
 * el asiento se filtraban por empresaId, y el .select() parcial omitia la
 * columna empresaId, con lo que el TenantSubscriber (que solo revisa
 * entidades que llegan CON empresaId) tampoco podia detectarlo: la fuga era
 * silenciosa, sin 403 y sin log.
 *
 * COBERTURA:
 * 1. El filtro por empresaId existe — en la linea Y en el asiento
 * 2. El empresaId sale del contexto de tenant, nunca de un parametro del request
 * 3. empresaId viaja en el select → el TenantSubscriber vuelve a ver la entidad
 * 4. Dos empresas con una cuenta del MISMO codigo → cada una consulta con su id
 * 5. Sin contexto de empresa → lanza, y no llega a ejecutar el query
 */

import { ContabilidadService } from './services/contabilidad.service';
import { NaturalezaCuenta } from './entities/cuenta-contable.entity';

interface QbCapturado {
  select: string[];
  joins:  { condicion: string; params: Record<string, unknown> }[];
  wheres: { condicion: string; params: Record<string, unknown> }[];
}

/** QueryBuilder de mentira que anota lo que el servicio le pide. */
function makeQb(captura: QbCapturado, filas: any[]) {
  const qb: any = {
    innerJoin: (_rel: string, _alias: string, condicion: string, params: any = {}) => {
      captura.joins.push({ condicion, params }); return qb;
    },
    select:    (cols: string[]) => { captura.select.push(...cols); return qb; },
    addSelect: () => qb,
    where:     (condicion: string, params: any = {}) => { captura.wheres.push({ condicion, params }); return qb; },
    andWhere:  (condicion: string, params: any = {}) => { captura.wheres.push({ condicion, params }); return qb; },
    orderBy:   () => qb,
    getMany:   () => Promise.resolve(filas),
  };
  return qb;
}

/**
 * @param empresaId  null = sin contexto de tenant (getEmpresaId lanza)
 * @param cuenta     la cuenta que findCuentaById debe devolver
 */
function makeService(
  empresaId: number | null,
  cuenta: any,
  captura: QbCapturado,
  filas: any[] = [],
) {
  const tenantService = {
    getEmpresaId: () => {
      if (empresaId === null) throw new Error('Se requiere contexto de empresa.');
      return empresaId;
    },
  } as any;

  const cuentaRepository = { findOne: () => Promise.resolve(cuenta) } as any;
  const anexoRepository  = { find: () => Promise.resolve([]) } as any;
  const lineaRepository  = { createQueryBuilder: () => makeQb(captura, filas) } as any;

  return new ContabilidadService(
    cuentaRepository,
    anexoRepository,
    {} as any,          // asientoRepository — no se usa en getLibroMayor
    lineaRepository,
    tenantService,
    {} as any,          // dataSource — idem
  );
}

const CUENTA_ITBIS = {
  id: 42, codigo: '2.1.2.01', nombre: 'ITBIS por Pagar (Ventas)',
  tipo: 'pasivo', naturaleza: NaturalezaCuenta.ACREEDORA,
};

/** Todas las condiciones (join + where) en una sola cadena, para buscar en ellas. */
const todasLasCondiciones = (c: QbCapturado) =>
  [...c.joins, ...c.wheres].map(x => x.condicion).join(' | ');

/** Todos los parametros ligados, juntos. */
const todosLosParams = (c: QbCapturado) =>
  Object.assign({}, ...[...c.joins, ...c.wheres].map(x => x.params));

function capturaVacia(): QbCapturado {
  return { select: [], joins: [], wheres: [] };
}

describe('getLibroMayor — aislamiento multi-tenant', () => {
  // Regresion 2026-09-23 (la segunda del mismo dia): el primer intento de fix
  // filtraba TAMBIEN por l.empresaId y dejo el Libro Mayor vacio en produccion.
  // asiento_lineas.empresaId esta NULL en todas las filas que crea la app
  // (nadie lo asigna al insertar), asi que el scope tiene que colgar del
  // asiento. Este caso existe para que nadie lo "arregle" de vuelta.
  it('NO filtra por l.empresaId — esa columna esta NULL y vaciaria la pantalla', async () => {
    const captura = capturaVacia();
    await makeService(7, CUENTA_ITBIS, captura).getLibroMayor(42);

    expect(todasLasCondiciones(captura)).not.toContain('l.empresaId');
  });

  it('filtra por empresaId tambien en el asiento, no solo en la linea', async () => {
    const captura = capturaVacia();
    await makeService(7, CUENTA_ITBIS, captura).getLibroMayor(42);

    expect(todasLasCondiciones(captura)).toContain('a.empresaId');
  });

  it('el empresaId ligado es el del contexto de tenant', async () => {
    const captura = capturaVacia();
    await makeService(7, CUENTA_ITBIS, captura).getLibroMayor(42);

    expect(todosLosParams(captura)).toMatchObject({ eid: 7 });
  });

  it('incluye empresaId en el select — el dia que la columna se rellene, el subscriber lo vera', async () => {
    const captura = capturaVacia();
    await makeService(7, CUENTA_ITBIS, captura).getLibroMayor(42);

    expect(captura.select).toContain('l.empresaId');
  });

  it('dos empresas con una cuenta del mismo codigo consultan cada una con SU empresaId', async () => {
    // Mismo codigo contable, fila distinta en cada empresa: es el escenario
    // real del bug — el catalogo se siembra por empresa (seedPlanCuentas).
    const capturaA = capturaVacia();
    const capturaB = capturaVacia();

    await makeService(7,  { ...CUENTA_ITBIS, id: 42 }, capturaA).getLibroMayor(42);
    await makeService(99, { ...CUENTA_ITBIS, id: 88 }, capturaB).getLibroMayor(88);

    expect(todosLosParams(capturaA)).toMatchObject({ eid: 7,  id: 42 });
    expect(todosLosParams(capturaB)).toMatchObject({ eid: 99, id: 88 });
    expect(todosLosParams(capturaA).eid).not.toBe(todosLosParams(capturaB).eid);
  });

  it('sin contexto de empresa lanza y NO ejecuta el query', async () => {
    const captura = capturaVacia();
    const svc = makeService(null, CUENTA_ITBIS, captura);

    await expect(svc.getLibroMayor(42)).rejects.toThrow(/contexto de empresa/i);
    expect(captura.wheres).toHaveLength(0);
  });

  it('devuelve los movimientos con su saldo acumulado (la funcion sigue haciendo su trabajo)', async () => {
    const captura = capturaVacia();
    const filas = [
      { id: 1, empresaId: 7, descripcion: 'ITBIS debito fiscal FAC-101', debe: 0,  haber: 100 },
      { id: 2, empresaId: 7, descripcion: 'Reversa ITBIS — NC NC-001',   debe: 40, haber: 0   },
    ];
    const svc = makeService(7, CUENTA_ITBIS, captura, filas);

    const r = await svc.getLibroMayor(42);

    // Cuenta acreedora: haber suma, debe resta.
    expect(r.movimientos.map(m => m.saldo)).toEqual([100, 60]);
    expect(r.saldoFinal).toBe(60);
  });
});
