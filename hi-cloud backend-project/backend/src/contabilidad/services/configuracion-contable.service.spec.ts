/**
 * Configuración Contable por Módulo (2026-09-19) — reemplaza, concepto por
 * concepto, los códigos de cuenta hardcodeados del motor de asientos.
 * Cobertura: default cuando no hay fila configurada, override cuando sí,
 * caché (una sola query por TTL, invalidada en cada escritura), validación
 * contra el catálogo real (cuenta inexistente/inactiva/de agrupación) tanto
 * al listar (advertencia) como al guardar (rechaza).
 */

import { ConfiguracionContableService, CONCEPTOS_CONTABLES } from './configuracion-contable.service';
import { COD } from '../constants/cod-cuentas.constants';

function cuenta(codigo: string, overrides: Record<string, unknown> = {}) {
  return { id: 1, codigo, nombre: `Cuenta ${codigo}`, isActive: true, permiteMovimientos: true, ...overrides };
}

function makeService(opts: { cuentas?: any[]; filas?: any[] } = {}) {
  const configRepository: any = {
    find:    jest.fn().mockResolvedValue(opts.filas ?? []),
    findOne: jest.fn(async ({ where }: any) => (opts.filas ?? []).find(f => f.concepto === where.concepto) ?? null),
    create:  jest.fn((data: any) => data),
    save:    jest.fn(async (data: any) => ({ id: 99, ...data })),
    update:  jest.fn().mockResolvedValue({}),
  };
  const cuentaRepository: any = {
    find:    jest.fn().mockResolvedValue(opts.cuentas ?? []),
    findOne: jest.fn(async ({ where }: any) => (opts.cuentas ?? []).find(c => c.codigo === where.codigo) ?? null),
  };
  const tenantService = { getEmpresaId: () => 7 };

  const svc = new ConfiguracionContableService(configRepository, cuentaRepository, tenantService as any);
  return { svc, configRepository, cuentaRepository };
}

describe('ConfiguracionContableService.obtenerMapa()', () => {
  it('sin ninguna fila configurada: cada concepto devuelve su default (COD.*)', async () => {
    const { svc } = makeService({ filas: [] });

    const mapa = await svc.obtenerMapa(7);

    expect(mapa.CLIENTES).toBe(COD.CLIENTES);
    expect(mapa.BANCOS).toBe(COD.BANCOS);
    expect(mapa.COBRO_TARJETA).toBe(COD.BANCOS); // default de los 4 conceptos nuevos: el comportamiento de siempre
    expect(Object.keys(mapa)).toHaveLength(CONCEPTOS_CONTABLES.length);
  });

  it('con una fila configurada: ese concepto usa el valor guardado, el resto sigue en default', async () => {
    const { svc } = makeService({ filas: [{ concepto: 'COBRO_TARJETA', cuentaCodigo: '9.9.1.01' }] });

    const mapa = await svc.obtenerMapa(7);

    expect(mapa.COBRO_TARJETA).toBe('9.9.1.01');
    expect(mapa.BANCOS).toBe(COD.BANCOS);
  });

  it('cachea: una segunda llamada dentro del TTL no vuelve a consultar la BD', async () => {
    const { svc, configRepository } = makeService({ filas: [] });

    await svc.obtenerMapa(7);
    await svc.obtenerMapa(7);

    expect(configRepository.find).toHaveBeenCalledTimes(1);
  });

  it('empresas distintas no comparten caché', async () => {
    const { svc, configRepository } = makeService({ filas: [] });

    await svc.obtenerMapa(7);
    await svc.obtenerMapa(8);

    expect(configRepository.find).toHaveBeenCalledTimes(2);
  });
});

describe('ConfiguracionContableService.actualizar()', () => {
  it('con una cuenta válida: guarda, e invalida el caché de esa empresa', async () => {
    const { svc, configRepository, cuentaRepository } = makeService({
      cuentas: [cuenta('9.9.1.01')],
      filas: [],
    });
    await svc.obtenerMapa(7); // pobla el caché
    cuentaRepository.findOne.mockResolvedValueOnce(cuenta('9.9.1.01'));

    await svc.actualizar('COBRO_TARJETA', '9.9.1.01');

    expect(configRepository.save).toHaveBeenCalled();
    // El caché quedó invalidado — la siguiente lectura vuelve a consultar la BD.
    configRepository.find.mockResolvedValueOnce([{ concepto: 'COBRO_TARJETA', cuentaCodigo: '9.9.1.01' }]);
    const mapa = await svc.obtenerMapa(7);
    expect(mapa.COBRO_TARJETA).toBe('9.9.1.01');
  });

  it('concepto desconocido: rechaza sin tocar la BD', async () => {
    const { svc, configRepository } = makeService({ cuentas: [cuenta('9.9.1.01')] });

    await expect(svc.actualizar('NO_EXISTE', '9.9.1.01')).rejects.toThrow(/desconocido/i);
    expect(configRepository.save).not.toHaveBeenCalled();
  });

  it('cuenta inexistente para la empresa: rechaza con motivo legible', async () => {
    const { svc } = makeService({ cuentas: [] });

    await expect(svc.actualizar('BANCOS', '9.9.9.99')).rejects.toThrow(/no existe o está inactiva/i);
  });

  it('cuenta de agrupación (permiteMovimientos=false): rechaza — el selector por documento ya respeta esto, la configuración también', async () => {
    const { svc } = makeService({ cuentas: [cuenta('1.1', { permiteMovimientos: false })] });

    await expect(svc.actualizar('BANCOS', '1.1')).rejects.toThrow(/agrupación/i);
  });
});

describe('ConfiguracionContableService.listar()', () => {
  it('marca esDefault correctamente y trae el nombre real de la cuenta', async () => {
    const { svc } = makeService({
      cuentas: CONCEPTOS_CONTABLES.map(c => cuenta(c.default)),
      filas: [{ concepto: 'COBRO_TARJETA', cuentaCodigo: COD.BANCOS }], // configurada pero con el mismo valor que ya traía
    });

    const lista = await svc.listar();

    const clientes = lista.find(c => c.concepto === 'CLIENTES')!;
    expect(clientes.esDefault).toBe(true);
    expect(clientes.cuenta?.nombre).toBe(`Cuenta ${COD.CLIENTES}`);
  });

  it('cuenta configurada que ya no existe: trae advertencia, no revienta', async () => {
    const { svc } = makeService({
      cuentas: [], // ninguna cuenta real — todas "desaparecidas"
      filas: [{ concepto: 'BANCOS', cuentaCodigo: '9.9.9.99' }],
    });

    const lista = await svc.listar();

    const bancos = lista.find(c => c.concepto === 'BANCOS')!;
    expect(bancos.valorActual).toBe('9.9.9.99');
    expect(bancos.advertencia).toMatch(/no existe o está inactiva/i);
  });
});
