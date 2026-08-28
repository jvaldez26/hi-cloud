/**
 * Resolución del vínculo comercial por RNC: uno → vincula, ninguno → crea,
 * varios → no adivina.
 *
 * Lo de "varios" es el caso que importa: hay clientes distintos que comparten
 * RNC (sucursales de un mismo contribuyente registradas por separado). Elegir
 * una al azar manda la venta a la cuenta equivocada.
 */
import { VinculoClienteCompradorService } from './vinculo-cliente-comprador.service';

const CLIENTE_GENERICO = { id: 29, nombre: 'consumidor final', rfc: '000000000', rncReceptor: null };

function montar(opts: {
  factura?: any;
  candidatos?: any[];
} = {}) {
  const actualizaciones: any[] = [];
  const creados: any[] = [];
  const candidatos = opts.candidatos ?? [];

  const facturaRepo = {
    findOne: async () => opts.factura === undefined
      ? {
          id: 13932, empresaId: 42, folio: 'FAC-1258',
          rncComprador: '131904718',
          razonSocialComprador: 'RODELA CONSTRUCCIONES RODECO SRL',
          cliente: CLIENTE_GENERICO,
        }
      : opts.factura,
    update: async (criterio: any, campos: any) => { actualizaciones.push({ criterio, campos }); },
  };

  const clienteRepo = {
    createQueryBuilder: () => {
      const qb: any = {
        where: () => qb, andWhere: () => qb, orderBy: () => qb,
        getMany: async () => candidatos,
      };
      return qb;
    },
    create: (x: any) => x,
    save:   async (x: any) => { const c = { id: 812, ...x }; creados.push(c); return c; },
  };

  const svc = new VinculoClienteCompradorService(facturaRepo as any, clienteRepo as any);
  return { svc, actualizaciones, creados };
}

describe('VinculoClienteCompradorService', () => {
  it('un candidato → vincula y no toca nada más', async () => {
    const { svc, actualizaciones, creados } = montar({
      candidatos: [{ id: 401, nombre: 'RODELA CONSTRUCCIONES RODECO SRL', rncReceptor: '131904718' }],
    });

    expect(await svc.vincular(13932, 42)).toBe('vinculado');
    expect(creados).toHaveLength(0);
    expect(actualizaciones).toEqual([
      { criterio: { id: 13932, empresaId: 42 }, campos: { clienteId: 401 } },
    ]);
  });

  it('ningún candidato → crea el cliente con la razón social declarada y vincula', async () => {
    const { svc, actualizaciones, creados } = montar({ candidatos: [] });

    expect(await svc.vincular(13932, 42)).toBe('creado');
    expect(creados[0]).toMatchObject({
      empresaId:   42,
      nombre:      'RODELA CONSTRUCCIONES RODECO SRL',
      razonSocial: 'RODELA CONSTRUCCIONES RODECO SRL',
      rncReceptor: '131904718',
      tipoCliente: 'persona_juridica',
    });
    expect(actualizaciones[0].campos).toEqual({ clienteId: 812 });
  });

  it('varios candidatos → NO adivina: deja la factura como está', async () => {
    const { svc, actualizaciones, creados } = montar({
      candidatos: [
        { id: 401, nombre: 'RODELA (Santiago)', rncReceptor: '131904718' },
        { id: 402, nombre: 'RODELA (Santo Domingo)', rncReceptor: '131904718' },
      ],
    });

    expect(await svc.vincular(13932, 42)).toBe('ambiguo');
    expect(actualizaciones).toHaveLength(0);
    expect(creados).toHaveLength(0);
  });

  it('nunca escribe el snapshot fiscal — solo clienteId', async () => {
    const { svc, actualizaciones } = montar({
      candidatos: [{ id: 401, rncReceptor: '131904718' }],
    });
    await svc.vincular(13932, 42);

    for (const { campos } of actualizaciones) {
      expect(Object.keys(campos)).toEqual(['clienteId']);
    }
  });

  it('si el cliente vinculado ya tiene otro RNC propio, no lo repunta', async () => {
    const { svc, actualizaciones } = montar({
      factura: {
        id: 1, empresaId: 42, folio: 'FAC-1', rncComprador: '131904718',
        cliente: { id: 55, nombre: 'VIGOMISA SRL', rncReceptor: '130266808' },
      },
      candidatos: [{ id: 401, rncReceptor: '131904718' }],
    });

    expect(await svc.vincular(1, 42)).toBe('cliente_propio');
    expect(actualizaciones).toHaveLength(0);
  });

  it('si ya apunta al cliente correcto, no hace nada', async () => {
    const { svc, actualizaciones } = montar({
      factura: {
        id: 1, empresaId: 42, folio: 'FAC-1', rncComprador: '131904718',
        cliente: { id: 401, nombre: 'RODELA', rncReceptor: '131904718' },
      },
    });

    expect(await svc.vincular(1, 42)).toBe('ya_correcto');
    expect(actualizaciones).toHaveLength(0);
  });

  it('sin RNC declarado no hay nada que resolver — el genérico se queda', async () => {
    const { svc, actualizaciones } = montar({
      factura: {
        id: 1, empresaId: 42, folio: 'FAC-1',
        rncComprador: '00000000000', cliente: CLIENTE_GENERICO,
      },
    });

    expect(await svc.vincular(1, 42)).toBe('sin_rnc');
    expect(actualizaciones).toHaveLength(0);
  });

  it('no bautiza un cliente identificado como "Consumidor final"', async () => {
    // Caso real (empresa 61, FAC-463): el cajero tecleó una cédula pero el
    // padrón no había respondido, así que se declaró "Consumidor final". Crear
    // un cliente con cédula real llamado así lo vuelve indistinguible del
    // genérico; mejor el RNC a secas, que invita a corregirlo.
    const { svc, creados } = montar({
      factura: {
        id: 1, empresaId: 61, folio: 'FAC-463',
        rncComprador: '05401436216', razonSocialComprador: 'Consumidor final',
        cliente: CLIENTE_GENERICO,
      },
      candidatos: [],
    });

    await svc.vincular(1, 61);
    expect(creados[0].nombre).toBe('RNC 05401436216');
  });

  it('sin razón social declarada usa el RNC como nombre', async () => {
    const { svc, creados } = montar({
      factura: {
        id: 1, empresaId: 61, folio: 'FAC-104',
        rncComprador: '132414691', razonSocialComprador: null,
        cliente: CLIENTE_GENERICO,
      },
      candidatos: [],
    });

    await svc.vincular(1, 61);
    expect(creados[0].nombre).toBe('RNC 132414691');
  });

  it('once dígitos → persona física, no jurídica', async () => {
    const { svc, creados } = montar({
      factura: {
        id: 1, empresaId: 61, folio: 'FAC-463',
        rncComprador: '05401436216', razonSocialComprador: 'JUAN PEREZ MARTINEZ',
        cliente: CLIENTE_GENERICO,
      },
      candidatos: [],
    });

    await svc.vincular(1, 61);
    expect(creados[0].tipoCliente).toBe('persona_fisica');
  });

  it('falla abierta: un error de base no puede tumbar una emisión ya buena', async () => {
    const svc = new VinculoClienteCompradorService(
      { findOne: async () => { throw new Error('conexión caída'); } } as any,
      {} as any,
    );
    await expect(svc.vincular(1, 42)).resolves.toBe('ambiguo');
  });
});
