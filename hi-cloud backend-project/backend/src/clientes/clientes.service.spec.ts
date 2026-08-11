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
