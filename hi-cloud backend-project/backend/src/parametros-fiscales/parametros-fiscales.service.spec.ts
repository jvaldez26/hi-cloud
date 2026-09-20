/**
 * ParametrosFiscalesService — resolver() nunca deja pasar un valor sin
 * confirmar, y crearVersion()/validar() nunca editan una fila vigente en
 * sitio (se cierra y se crea otra). Ver el principio en el comentario de
 * la entidad ParametroFiscal.
 */

import { ParametrosFiscalesService } from './parametros-fiscales.service';
import { EstadoParametroFiscal } from './entities/parametro-fiscal.entity';
import {
  ParametroFiscalNoEncontradoError,
  ParametroFiscalPendienteError,
  ParametroFiscalVigenciaError,
} from './errors/parametro-fiscal.errors';

function makeService(filas: any[]) {
  const qb: any = {
    where:      jest.fn().mockReturnThis(),
    andWhere:   jest.fn().mockReturnThis(),
    orderBy:    jest.fn().mockReturnThis(),
    getOne:     jest.fn().mockResolvedValue(filas[0] ?? null),
  };
  const repo: any = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    find: jest.fn().mockResolvedValue(filas),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => ({ id: 99, ...x })),
    update: jest.fn().mockResolvedValue({}),
  };
  const auditoria: any = { registrar: jest.fn().mockResolvedValue(undefined) };
  const dataSource: any = {
    transaction: jest.fn((cb: any) => cb({ getRepository: () => repo })),
  };

  const svc: any = Object.create(ParametrosFiscalesService.prototype);
  svc.repo = repo;
  svc.dataSource = dataSource;
  svc.auditoria = auditoria;
  return { svc: svc as ParametrosFiscalesService, repo, qb, auditoria, dataSource };
}

describe('ParametrosFiscalesService.resolver()', () => {
  it('devuelve el valor cuando hay una fila VALIDADO vigente en la fecha', async () => {
    const { svc } = makeService([{ valor: { porMes: 3 }, estado: EstadoParametroFiscal.VALIDADO }]);
    const r = await svc.resolver('recargo_mora', '2026-08-20');
    expect(r).toEqual({ porMes: 3 });
  });

  it('sin ninguna fila que cubra la fecha: error explícito, no null', async () => {
    const { svc } = makeService([]);
    await expect(svc.resolver('recargo_mora', '2026-08-20'))
      .rejects.toThrow(ParametroFiscalNoEncontradoError);
  });

  it('fila vigente PENDIENTE_VALIDACION: error explícito, nunca deja pasar el valor', async () => {
    const { svc } = makeService([{ valor: null, estado: EstadoParametroFiscal.PENDIENTE_VALIDACION }]);
    await expect(svc.resolver('escala_isr_pf', '2027-03-01'))
      .rejects.toThrow(ParametroFiscalPendienteError);
  });
});

describe('ParametrosFiscalesService.crearVersion()', () => {
  it('sin fila abierta previa: crea la nueva directamente, sin cerrar nada', async () => {
    const { svc, repo, auditoria } = makeService([]);
    repo.findOne.mockResolvedValue(null);

    const dto = { clave: 'itbis_tasas', valor: { general: 18 }, vigenciaDesde: '2026-01-01', baseLegal: 'x', fuente: 'x' };
    await svc.crearVersion(dto as any, 1, 'Jean');

    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      clave: 'itbis_tasas', vigenciaHasta: null, estado: EstadoParametroFiscal.PENDIENTE_VALIDACION,
    }));
    expect(auditoria.registrar).toHaveBeenCalledTimes(1); // solo el CREATE, no hubo cierre
  });

  it('con fila abierta previa: la CIERRA (vigenciaHasta = día anterior) y crea la nueva — nunca edita el valor de la vieja', async () => {
    const { svc, repo, auditoria } = makeService([]);
    repo.findOne.mockResolvedValue({ id: 5, clave: 'itbis_tasas', vigenciaDesde: '2013-01-01', vigenciaHasta: null });

    const dto = { clave: 'itbis_tasas', valor: { general: 19 }, vigenciaDesde: '2026-10-01', baseLegal: 'x', fuente: 'x' };
    await svc.crearVersion(dto as any, 1, 'Jean');

    expect(repo.update).toHaveBeenCalledWith(5, { vigenciaHasta: '2026-09-30' });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ clave: 'itbis_tasas', valor: { general: 19 } }));
    expect(auditoria.registrar).toHaveBeenCalledTimes(2); // cierre + creación
  });

  it('nueva vigenciaDesde igual o anterior a la de la fila abierta: rechaza, no permite vigencias que se pisan', async () => {
    const { svc, repo } = makeService([]);
    repo.findOne.mockResolvedValue({ id: 5, clave: 'itbis_tasas', vigenciaDesde: '2026-10-01', vigenciaHasta: null });

    const dto = { clave: 'itbis_tasas', valor: {}, vigenciaDesde: '2026-09-01', baseLegal: 'x', fuente: 'x' };
    await expect(svc.crearVersion(dto as any, 1)).rejects.toThrow(ParametroFiscalVigenciaError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('ParametrosFiscalesService.validar()', () => {
  it('marca VALIDADO sin tocar el valor ni la vigencia', async () => {
    const { svc, repo, auditoria } = makeService([]);
    const fila = { id: 7, clave: 'itbis_tasas', valor: { general: 18 }, vigenciaDesde: '2013-01-01', estado: EstadoParametroFiscal.PENDIENTE_VALIDACION };
    repo.findOneOrFail.mockResolvedValue(fila);

    const r = await svc.validar(7, 1, 'Jean');

    expect(r.estado).toBe(EstadoParametroFiscal.VALIDADO);
    expect(r.valor).toEqual({ general: 18 }); // intacto
    expect(r.validadoPor).toBe(1);
    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
  });
});
