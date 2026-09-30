import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { XlinkService } from './xlink.service';
import { SuscripcionEstado } from '../suscripciones/entities/suscripcion.entity';

const EMPRESA = 7;
const OTRA_EMPRESA_XLINK_ID = '11111111-1111-1111-1111-111111111111';

function buildDeps() {
  return {
    empresaRepo: {
      findOne: jest.fn().mockResolvedValue({ id: EMPRESA, xlinkVisible: false, xlinkVisibleDesde: null }),
      update:  jest.fn().mockResolvedValue(undefined),
    },
    ds: { query: jest.fn().mockResolvedValue([]) },
    tenantSvc: { getEmpresaId: () => EMPRESA },
    limitesSvc: { getSuscripcion: jest.fn().mockResolvedValue({ estado: SuscripcionEstado.ACTIVA }) },
    auditoriaSvc: { registrar: jest.fn().mockResolvedValue(undefined) },
    proveedoresSvc: { create: jest.fn().mockResolvedValue({ id: 900 }), findOne: jest.fn().mockResolvedValue({ id: 1 }) },
    clientesSvc: { create: jest.fn().mockResolvedValue({ id: 901 }), findOne: jest.fn().mockResolvedValue({ id: 2 }) },
    xlinkRepo: {
      listarComoOrigen: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      listarComoDestino: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      contarPendientesComoDestino: jest.fn().mockResolvedValue(0),
    },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): XlinkService {
  return new XlinkService(
    d.empresaRepo as any,
    d.ds as any,
    d.tenantSvc as any,
    d.limitesSvc as any,
    d.auditoriaSvc as any,
    d.proveedoresSvc as any,
    d.clientesSvc as any,
    d.xlinkRepo as any,
  );
}

describe('XlinkService.assertPuedeUsarXlink', () => {
  it('rechaza si la empresa no está xlinkVisible', async () => {
    const d = buildDeps();
    d.empresaRepo.findOne.mockResolvedValue({ id: EMPRESA, xlinkVisible: false });
    const service = buildService(d);
    await expect(service.assertPuedeUsarXlink(EMPRESA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite si la empresa está xlinkVisible', async () => {
    const d = buildDeps();
    d.empresaRepo.findOne.mockResolvedValue({ id: EMPRESA, xlinkVisible: true });
    const service = buildService(d);
    await expect(service.assertPuedeUsarXlink(EMPRESA)).resolves.toBeUndefined();
  });
});

describe('XlinkService.actualizarVisibilidad', () => {
  it('rechaza activar mientras la empresa está en período de prueba', async () => {
    const d = buildDeps();
    d.limitesSvc.getSuscripcion.mockResolvedValue({ estado: SuscripcionEstado.PRUEBA });
    const service = buildService(d);

    await expect(service.actualizarVisibilidad(true, { id: 1, nombre: 'Ana' })).rejects.toBeInstanceOf(BadRequestException);
    expect(d.empresaRepo.update).not.toHaveBeenCalled();
  });

  it('activa cuando la suscripción NO está en prueba, y registra auditoría', async () => {
    const d = buildDeps();
    const service = buildService(d);

    const result = await service.actualizarVisibilidad(true, { id: 1, nombre: 'Ana' });

    expect(result).toEqual({ xlinkVisible: true });
    expect(d.empresaRepo.update).toHaveBeenCalledWith(EMPRESA, expect.objectContaining({ xlinkVisible: true }));
    expect(d.auditoriaSvc.registrar).toHaveBeenCalledWith(expect.objectContaining({
      modulo: 'xlink', entidad: 'Empresa', entidadId: String(EMPRESA),
    }));
  });

  it('desactivar NUNCA valida trial (solo se bloquea activar)', async () => {
    const d = buildDeps();
    d.limitesSvc.getSuscripcion.mockResolvedValue({ estado: SuscripcionEstado.PRUEBA });
    const service = buildService(d);

    await expect(service.actualizarVisibilidad(false, { id: 1 })).resolves.toEqual({ xlinkVisible: false });
    expect(d.limitesSvc.getSuscripcion).not.toHaveBeenCalled();
  });

  it('no reescribe xlinkVisibleDesde si ya estaba activada antes', async () => {
    const d = buildDeps();
    d.empresaRepo.findOne.mockResolvedValue({ id: EMPRESA, xlinkVisible: true, xlinkVisibleDesde: new Date('2026-01-01') });
    const service = buildService(d);

    await service.actualizarVisibilidad(true, { id: 1 });

    const args = d.empresaRepo.update.mock.calls[0][1];
    expect(args.xlinkVisibleDesde).toBeUndefined();
  });
});

describe('XlinkService.getDirectorio', () => {
  it('mapea cada fila a vinculado/coincide_sin_vincular/no_existe correctamente', async () => {
    const d = buildDeps();
    d.ds.query
      .mockResolvedValueOnce([
        {
          xlinkId: 'a', nombreComercial: 'Empresa A', nombre: 'A', rnc: '101', industria: 'COMERCIO',
          proveedorVinculadoId: 5, proveedorVinculadoNombre: 'Mi Proveedor A',
          proveedorRncId: null, proveedorRncNombre: null,
          clienteVinculadoId: null, clienteVinculadoNombre: null,
          clienteRncId: 8, clienteRncNombre: 'Coincide Cliente',
        },
        {
          xlinkId: 'b', nombreComercial: null, nombre: 'B', rnc: '102', industria: null,
          proveedorVinculadoId: null, proveedorVinculadoNombre: null,
          proveedorRncId: null, proveedorRncNombre: null,
          clienteVinculadoId: null, clienteVinculadoNombre: null,
          clienteRncId: null, clienteRncNombre: null,
        },
      ])
      .mockResolvedValueOnce([{ total: '2' }]);
    const service = buildService(d);

    const result = await service.getDirectorio({});

    expect(result.data[0]).toEqual({
      xlinkId: 'a', nombreComercial: 'Empresa A', rnc: '101', industria: 'COMERCIO',
      proveedorRelacionado: { estado: 'vinculado', id: 5, nombre: 'Mi Proveedor A' },
      clienteRelacionado: { estado: 'coincide_sin_vincular', id: 8, nombre: 'Coincide Cliente' },
    });
    expect(result.data[1]).toEqual({
      xlinkId: 'b', nombreComercial: 'B', rnc: '102', industria: null,
      proveedorRelacionado: { estado: 'no_existe' },
      clienteRelacionado: { estado: 'no_existe' },
    });
    expect(result.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
  });

  it('nunca expone empresaId — solo xlinkId', async () => {
    const d = buildDeps();
    d.ds.query
      .mockResolvedValueOnce([{
        xlinkId: 'a', nombreComercial: 'Empresa A', nombre: 'A', rnc: '101', industria: null,
        proveedorVinculadoId: null, proveedorVinculadoNombre: null,
        proveedorRncId: null, proveedorRncNombre: null,
        clienteVinculadoId: null, clienteVinculadoNombre: null,
        clienteRncId: null, clienteRncNombre: null,
      }])
      .mockResolvedValueOnce([{ total: '1' }]);
    const service = buildService(d);

    const result = await service.getDirectorio({});

    expect(result.data[0]).not.toHaveProperty('id');
    expect(result.data[0]).not.toHaveProperty('empresaId');
  });

  it('con soloRegistradas: true, agrega el filtro HAVING vinculado en ambas queries', async () => {
    const d = buildDeps();
    d.ds.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }]);
    const service = buildService(d);

    await service.getDirectorio({ soloRegistradas: true });

    expect(d.ds.query.mock.calls[0][0]).toContain('pv.id IS NOT NULL OR cv.id IS NOT NULL');
    expect(d.ds.query.mock.calls[1][0]).toContain('pv.id IS NOT NULL OR cv.id IS NOT NULL');
  });

  it('pasa el término de búsqueda como %q% y nunca el empresaId propio en el resultado', async () => {
    const d = buildDeps();
    d.ds.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }]);
    const service = buildService(d);

    await service.getDirectorio({ q: 'Rica' });

    expect(d.ds.query.mock.calls[0][1]).toEqual([EMPRESA, '%Rica%', 0]);
  });
});

describe('XlinkService.vincular', () => {
  const contraparteRow = { id: 99, nombreComercial: 'Proveedor Test SRL', nombre: 'Proveedor Test', rnc: '130000001', xlinkVisible: true, isActive: true };

  it('rechaza vincularse con la propia empresa', async () => {
    const d = buildDeps();
    d.ds.query.mockResolvedValueOnce([{ ...contraparteRow, id: EMPRESA }]);
    const service = buildService(d);

    await expect(service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'proveedor' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si la contraparte no existe', async () => {
    const d = buildDeps();
    d.ds.query.mockResolvedValueOnce([]);
    const service = buildService(d);

    await expect(service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'proveedor' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si la contraparte ya no está visible', async () => {
    const d = buildDeps();
    d.ds.query.mockResolvedValueOnce([{ ...contraparteRow, xlinkVisible: false }]);
    const service = buildService(d);

    await expect(service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'proveedor' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('proveedor: ya vinculado — devuelve el existente sin crear otro', async () => {
    const d = buildDeps();
    d.ds.query
      .mockResolvedValueOnce([contraparteRow])       // SELECT empresa
      .mockResolvedValueOnce([{ id: 5 }]);            // yaVinculado
    const service = buildService(d);

    const result = await service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'proveedor' });

    expect(d.proveedoresSvc.findOne).toHaveBeenCalledWith(5);
    expect(d.proveedoresSvc.create).not.toHaveBeenCalled();
  });

  it('proveedor: coincidencia ÚNICA por RNC sin vincular — vincula el existente', async () => {
    const d = buildDeps();
    d.ds.query
      .mockResolvedValueOnce([contraparteRow])   // SELECT empresa
      .mockResolvedValueOnce([])                 // yaVinculado (ninguno)
      .mockResolvedValueOnce([{ id: 11 }])        // coincideRnc — exactamente 1
      .mockResolvedValueOnce(undefined);          // UPDATE
    const service = buildService(d);

    await service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'proveedor' });

    expect(d.ds.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE proveedores'),
      [OTRA_EMPRESA_XLINK_ID, 11],
    );
    expect(d.proveedoresSvc.findOne).toHaveBeenCalledWith(11);
    expect(d.proveedoresSvc.create).not.toHaveBeenCalled();
  });

  it('proveedor: SIN coincidencia por RNC — crea uno nuevo con el nombre de la contraparte', async () => {
    const d = buildDeps();
    d.ds.query
      .mockResolvedValueOnce([contraparteRow]) // SELECT empresa
      .mockResolvedValueOnce([])                // yaVinculado
      .mockResolvedValueOnce([]);               // coincideRnc — ninguno
    const service = buildService(d);

    await service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'proveedor' });

    expect(d.proveedoresSvc.create).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'Proveedor Test SRL', rnc: '130000001', xlinkEmpresaXlinkId: OTRA_EMPRESA_XLINK_ID,
    }));
  });

  it('proveedor: coincidencia AMBIGUA (más de un RNC) — crea uno nuevo en vez de adivinar', async () => {
    const d = buildDeps();
    d.ds.query
      .mockResolvedValueOnce([contraparteRow]) // SELECT empresa
      .mockResolvedValueOnce([])                // yaVinculado
      .mockResolvedValueOnce([{ id: 11 }, { id: 12 }]); // coincideRnc — 2 matches
    const service = buildService(d);

    await service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'proveedor' });

    expect(d.proveedoresSvc.create).toHaveBeenCalledTimes(1);
  });

  it('cliente: SIN coincidencia — crea uno nuevo usando rncReceptor', async () => {
    const d = buildDeps();
    d.ds.query
      .mockResolvedValueOnce([contraparteRow]) // SELECT empresa
      .mockResolvedValueOnce([])                // yaVinculado
      .mockResolvedValueOnce([]);               // coincideRnc
    const service = buildService(d);

    await service.vincular({ xlinkId: OTRA_EMPRESA_XLINK_ID, rol: 'cliente' });

    expect(d.clientesSvc.create).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'Proveedor Test SRL', rncReceptor: '130000001', xlinkEmpresaXlinkId: OTRA_EMPRESA_XLINK_ID,
    }));
  });
});

describe('XlinkService — listados y conteo (Fase 5)', () => {
  it('listarEnviados() delega en xlinkRepo.listarComoOrigen', async () => {
    const d = buildDeps();
    const service = buildService(d);
    const filtros = { page: 2 };

    await service.listarEnviados(filtros);

    expect(d.xlinkRepo.listarComoOrigen).toHaveBeenCalledWith(filtros);
  });

  it('listarRecibidos() delega en xlinkRepo.listarComoDestino', async () => {
    const d = buildDeps();
    const service = buildService(d);
    const filtros = { estadoReceptor: 'pendiente' as any };

    await service.listarRecibidos(filtros);

    expect(d.xlinkRepo.listarComoDestino).toHaveBeenCalledWith(filtros);
  });

  it('contarPendientes() envuelve el número en { total }', async () => {
    const d = buildDeps();
    d.xlinkRepo.contarPendientesComoDestino.mockResolvedValue(4);
    const service = buildService(d);

    await expect(service.contarPendientes()).resolves.toEqual({ total: 4 });
  });

  it('listarRecibidos() agrega contraparteXlinkId/contraparteNombre desde la empresa ORIGEN de cada fila', async () => {
    const d = buildDeps();
    d.xlinkRepo.listarComoDestino.mockResolvedValue({
      data: [{ id: 1, origenEmpresaId: 3 }, { id: 2, origenEmpresaId: 3 }],
      meta: { total: 2 },
    });
    d.ds.query.mockResolvedValue([{ id: 3, xlinkId: 'xlink-3', nombre: 'Proveedor X' }]);
    const service = buildService(d);

    const result = await service.listarRecibidos({});

    expect(d.ds.query).toHaveBeenCalledTimes(1); // un solo query, no uno por fila
    expect(result.data).toEqual([
      { id: 1, origenEmpresaId: 3, contraparteXlinkId: 'xlink-3', contraparteNombre: 'Proveedor X' },
      { id: 2, origenEmpresaId: 3, contraparteXlinkId: 'xlink-3', contraparteNombre: 'Proveedor X' },
    ]);
  });

  it('listarEnviados() agrega contraparteXlinkId/contraparteNombre desde la empresa DESTINO de cada fila', async () => {
    const d = buildDeps();
    d.xlinkRepo.listarComoOrigen.mockResolvedValue({ data: [{ id: 1, destinoEmpresaId: 9 }], meta: { total: 1 } });
    d.ds.query.mockResolvedValue([{ id: 9, xlinkId: 'xlink-9', nombre: 'Cliente Y' }]);
    const service = buildService(d);

    const result = await service.listarEnviados({});

    expect(result.data).toEqual([{ id: 1, destinoEmpresaId: 9, contraparteXlinkId: 'xlink-9', contraparteNombre: 'Cliente Y' }]);
  });
});
