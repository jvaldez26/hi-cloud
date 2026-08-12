import { BadRequestException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

/**
 * Reglas de RNC en clientes:
 *  - compartir RNC entre clientes es válido (escuelas de un mismo distrito)
 *  - el RNC de la propia empresa NUNCA puede ser el RNC del comprador
 */
describe('ClientesService — reglas de RNC', () => {
  const RNC_EMPRESA = '133656914';

  const build = (rncEmpresa: string | null = RNC_EMPRESA) => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ rnc: rncEmpresa, nombre: 'INVENSEM SRL' }]),
    };
    const clienteRepo = { createQueryBuilder: jest.fn() };
    const service = new ClientesService(
      clienteRepo as any,
      dataSource as any,
      { getEmpresaId: () => 62 } as any,
      { notify: jest.fn() } as any,
      { verificarLimiteClientes: jest.fn() } as any,
    );
    return { service, dataSource };
  };

  const validar = (service: ClientesService, valor?: string | null) =>
    (service as any).validarRncReceptor(valor);

  it('rechaza el RNC de la propia empresa como RNC receptor', async () => {
    const { service } = build();
    await expect(validar(service, RNC_EMPRESA)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lo rechaza aunque venga con guiones o espacios', async () => {
    const { service } = build();
    await expect(validar(service, ' 1-3365-6914 ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el mensaje explica que ese RNC es el del emisor', async () => {
    const { service } = build();
    await expect(validar(service, RNC_EMPRESA)).rejects.toThrow(/su propia empresa/i);
  });

  it('acepta el RNC de un comprador distinto', async () => {
    const { service } = build();
    await expect(validar(service, '101532483')).resolves.toBeUndefined();
  });

  it('acepta vacío — el campo es opcional', async () => {
    const { service, dataSource } = build();
    await expect(validar(service, '')).resolves.toBeUndefined();
    await expect(validar(service, null)).resolves.toBeUndefined();
    await expect(validar(service, undefined)).resolves.toBeUndefined();
    expect(dataSource.query).not.toHaveBeenCalled();   // ni siquiera consulta
  });

  it('no bloquea nada si la empresa no tiene RNC configurado', async () => {
    const { service } = build(null);
    await expect(validar(service, '101532483')).resolves.toBeUndefined();
  });
});

/**
 * Ante DGII un RNC es un contribuyente: los clientes que lo compartan deben
 * declarar la misma razón social. Si el campo fiscal queda vacío se cae a
 * `nombre` — que es justo lo que los distingue — y cada uno declara algo
 * distinto. Pasó en producción con tres clientes del RNC 132269551.
 */
describe('ClientesService — razón social de un RNC compartido', () => {
  const build = (grupo: Array<{ nombre: string; razonSocial?: string }>) => {
    const service = new ClientesService(
      {} as any,
      { query: jest.fn().mockResolvedValue([{ rnc: '000', nombre: 'X' }]) } as any,
      { getEmpresaId: () => 57 } as any,
      { notify: jest.fn() } as any,
      { verificarLimiteClientes: jest.fn() } as any,
    );
    jest.spyOn(service, 'buscarPorRnc').mockResolvedValue({
      rnc: '132269551', total: grupo.length, clientes: grupo as any,
    });
    return service;
  };

  const resolver = (service: ClientesService, rfc?: string, razon?: string) =>
    (service as any).resolverRazonSocialDelGrupo(rfc, razon);

  it('hereda la razón social cuando el grupo declara una sola', async () => {
    const s = build([
      { nombre: 'Escuela Los Alcarrizos #3', razonSocial: 'DISTRITO EDUCATIVO 10-04' },
      { nombre: 'Escuela Manoguayabo',       razonSocial: 'DISTRITO EDUCATIVO 10-04' },
    ]);
    await expect(resolver(s, '132269551', undefined))
      .resolves.toBe('DISTRITO EDUCATIVO 10-04');
  });

  it('exige la razón social cuando el grupo no tiene ninguna', async () => {
    const s = build([{ nombre: 'VALDEZ GONZALEZ 2' }]);
    await expect(resolver(s, '132269551', ''))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige la razón social cuando el grupo declara varias distintas', async () => {
    const s = build([
      { nombre: 'A', razonSocial: 'RAZON UNO' },
      { nombre: 'B', razonSocial: 'RAZON DOS' },
    ]);
    await expect(resolver(s, '132269551', undefined)).rejects.toThrow(/no coinciden/i);
  });

  it('el mensaje nombra a los clientes que ya usan el RNC', async () => {
    const s = build([{ nombre: 'VALDEZ GONZALEZ 2' }]);
    await expect(resolver(s, '132269551', '')).rejects.toThrow(/VALDEZ GONZALEZ 2/);
  });

  it('respeta la razón social que el usuario escribió', async () => {
    const s = build([{ nombre: 'otro', razonSocial: 'RAZON DEL GRUPO' }]);
    await expect(resolver(s, '132269551', 'LA QUE YO PUSE')).resolves.toBeUndefined();
    expect(s.buscarPorRnc).not.toHaveBeenCalled();   // ni consulta el grupo
  });

  it('no exige nada cuando el RNC es nuevo — el fallback a nombre es correcto', async () => {
    const s = build([]);
    await expect(resolver(s, '101532483', undefined)).resolves.toBeUndefined();
  });

  it('no exige nada cuando el cliente no tiene RNC', async () => {
    const s = build([{ nombre: 'otro' }]);
    await expect(resolver(s, undefined, undefined)).resolves.toBeUndefined();
    await expect(resolver(s, '', undefined)).resolves.toBeUndefined();
  });
});
