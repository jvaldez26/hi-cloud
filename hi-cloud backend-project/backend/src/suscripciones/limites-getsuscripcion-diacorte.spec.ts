import { LimitesService } from './limites.service';

/**
 * Bug real: LimitesService.getSuscripcion() crea la suscripción fallback
 * (empresa sin fila en `suscripciones`) sin `diaCorte` — columna NOT NULL sin
 * default desde la migración 1754200000000-AddDiaCorte. El INSERT revienta.
 *
 * Fix: misma regla que auth.service.ts al registrar — el día de
 * fechaFinPrueba ancla diaCorte.
 */
function makeService(opts: { existente?: any } = {}) {
  let guardado: any = null;
  const repo = {
    findOne: jest.fn()
      .mockResolvedValueOnce(opts.existente ?? null) // primer findOne: no existe
      .mockImplementation(async () => guardado),       // segundo findOne (tras crear): la devuelve
    create: jest.fn((data: any) => data),
    save: jest.fn(async (entity: any) => { guardado = { id: 1, ...entity }; return guardado; }),
    update: jest.fn().mockResolvedValue({}),
  };
  const cuotaEcf = {};
  const svc = new LimitesService(repo as any, {} as any, cuotaEcf as any);
  return { svc, repo };
}

describe('LimitesService.getSuscripcion — fallback de creación incluye diaCorte', () => {
  it('una empresa sin fila en suscripciones: la crea CON diaCorte (NOT NULL, sin default)', async () => {
    const { svc, repo } = makeService();

    const sus = await svc.getSuscripcion(999);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 999, diaCorte: expect.any(Number) }),
    );
    const diaCorteCreado = (repo.create as jest.Mock).mock.calls[0][0].diaCorte;
    expect(diaCorteCreado).toBeGreaterThanOrEqual(1);
    expect(diaCorteCreado).toBeLessThanOrEqual(31);
    expect(sus.diaCorte).toBe(diaCorteCreado);
  });

  it('diaCorte creado coincide con el día de fechaFinPrueba — misma regla que auth.service.ts al registrar', async () => {
    const { svc, repo } = makeService();

    await svc.getSuscripcion(999);

    const creado = (repo.create as jest.Mock).mock.calls[0][0];
    expect(creado.diaCorte).toBe((creado.fechaVencimiento as Date).getDate());
  });

  it('una empresa que SÍ tiene suscripción: no la vuelve a crear, no toca diaCorte', async () => {
    const existente = { id: 5, empresaId: 7, diaCorte: 15, mesPeriodo: new Date().toISOString().slice(0, 7) };
    const { svc, repo } = makeService({ existente });

    const sus = await svc.getSuscripcion(7);

    expect(repo.create).not.toHaveBeenCalled();
    expect(sus.diaCorte).toBe(15);
  });
});
