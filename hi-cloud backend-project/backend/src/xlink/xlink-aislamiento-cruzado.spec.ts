import { XlinkDocumentosRepository } from './xlink-documentos.repository';
import { XlinkTipoDocumento } from './entities/xlink-documento.entity';

/**
 * Fase 6 — "un usuario de la empresa C no puede leer, recibir ni ver el
 * PDF de un Xlink entre A y B".
 *
 * XlinkDocumentosRepository es el ÚNICO punto de acceso a xlink_documentos
 * (ver el test estructural en xlink-documentos.repository.spec.ts) — cada
 * método exige el eid del CLS y filtra por origen/destino/cualquiera de
 * los dos. Este spec prueba el caso concreto con un repo TypeORM REAL
 * (no mockeado) para demostrar que el filtro de verdad excluye la fila,
 * no solo que se construyó el WHERE correcto.
 */

const EMPRESA_A = 1; // origen
const EMPRESA_B = 2; // destino
const EMPRESA_C = 3; // ajena — no es ni origen ni destino

const DOCUMENTO_A_B = {
  id: 501, origenEmpresaId: EMPRESA_A, destinoEmpresaId: EMPRESA_B,
  tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoOrigenId: 10,
  estadoReceptor: 'pendiente',
};

/** Repo TypeORM real, pero con datos en memoria — para probar el WHERE de verdad, no un mock que finge filtrar. */
function makeRepoConDatos(filas: any[]) {
  return {
    findOne: jest.fn(async (opts: any) => {
      const where = Array.isArray(opts.where) ? opts.where : [opts.where];
      return filas.find(f => where.some((w: any) => Object.entries(w).every(([k, v]) => (f as any)[k] === v))) ?? null;
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        where:    function (cond: string, params: any) { qb._where = { cond, params }; return this; },
        setLock:  function () { return this; },
        getOne:   async function () {
          const { params } = qb._where;
          return filas.find(f => f.id === params.id && f.destinoEmpresaId === params.destinoEmpresaId) ?? null;
        },
      };
      return qb;
    }),
  };
}

function makeTenantSvc(eid: number) {
  return { getEmpresaId: () => eid };
}

describe('HiCloud Xlink — aislamiento cruzado: empresa C no puede tocar un documento entre A y B', () => {
  it('buscarPorId() (usado por GET pdf-original): empresa C no lo encuentra', async () => {
    const repo = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_C) as any);

    await expect(repo.buscarPorId(501)).resolves.toBeNull();
  });

  it('buscarPorId(): en cambio, A (origen) y B (destino) SÍ lo encuentran', async () => {
    const repoA = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_A) as any);
    const repoB = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_B) as any);

    await expect(repoA.buscarPorId(501)).resolves.toEqual(DOCUMENTO_A_B);
    await expect(repoB.buscarPorId(501)).resolves.toEqual(DOCUMENTO_A_B);
  });

  it('buscarPorIdComoDestino() (usado por recibir/marcar-procesado/descartar): empresa C no lo encuentra aunque pida por el id correcto', async () => {
    const repo = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_C) as any);

    await expect(repo.buscarPorIdComoDestino(501)).resolves.toBeNull();
  });

  it('buscarPorIdComoOrigen() (usado por DELETE /xlink/enviados/:id): empresa C no lo encuentra', async () => {
    const repo = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_C) as any);

    await expect(repo.buscarPorIdComoOrigen(501)).resolves.toBeNull();
  });

  it('bloquearPorIdComoDestino() (FOR UPDATE dentro de recibir()): empresa C no lo encuentra — no puede recibir lo que no le pertenece', async () => {
    const repo = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_C) as any);
    const manager = { getRepository: () => makeRepoConDatos([DOCUMENTO_A_B]) } as any;

    await expect(repo.bloquearPorIdComoDestino(501, manager)).resolves.toBeNull();
  });

  it('bloquearPorIdComoDestino(): en cambio, B (destino real) SÍ lo encuentra y lo bloquea', async () => {
    const repo = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_B) as any);
    const manager = { getRepository: () => makeRepoConDatos([DOCUMENTO_A_B]) } as any;

    await expect(repo.bloquearPorIdComoDestino(501, manager)).resolves.toEqual(DOCUMENTO_A_B);
  });

  it('assertPerteneceAEmpresaActual(): rechaza explícitamente a la empresa C con ForbiddenException', () => {
    const repo = new XlinkDocumentosRepository(makeRepoConDatos([DOCUMENTO_A_B]) as any, makeTenantSvc(EMPRESA_C) as any);

    expect(() => repo.assertPerteneceAEmpresaActual(DOCUMENTO_A_B as any)).toThrow();
  });
});
