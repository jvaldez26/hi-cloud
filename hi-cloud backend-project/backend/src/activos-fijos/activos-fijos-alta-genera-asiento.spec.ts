/**
 * ActivosFijosService.createActivo() — asiento de alta (2026-09-19). Antes
 * de esta pieza, dar de alta un activo no generaba NINGÚN asiento contable
 * — CategoriaActivo.cuentaActivoCodigo existía en la entidad pero no tenía
 * ningún consumidor. Cobertura: la cuenta del activo sale de la categoría
 * (o del default ACTIVO_FIJO_DEFAULT si la categoría no tiene una propia),
 * la contrapartida es el selector por documento, y el alta del activo
 * nunca se cae por un problema contable (fire-and-forget).
 */

import { ActivosFijosService } from './activos-fijos.service';
import { EstadoActivo as EA } from './entities/activo-fijo.entity';
import { MetodoDepreciacion as MD } from './entities/categoria-activo.entity';

const DTO = {
  codigo: 'ACT-001', descripcion: 'Laptop Dell', categoriaId: 1,
  fechaAdquisicion: '2026-09-19', costoAdquisicion: 50000,
};

function makeService(categoria: any) {
  const activoRepository: any = {
    findOne: jest.fn().mockResolvedValue(null), // sin duplicado de código
    create:  jest.fn((data: any) => data),
    save:    jest.fn(async (data: any) => ({ id: 10, ...data })),
  };
  const categoriaRepository: any = { findOne: jest.fn().mockResolvedValue(categoria) };
  const asientosService: any = {
    asientoAltaActivo:      jest.fn().mockResolvedValue(undefined),
    previsualizarAltaActivo: jest.fn().mockResolvedValue({ ok: true, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: true }),
  };
  const configuracionService: any = { resolverCuenta: jest.fn().mockResolvedValue('1.2.1.01') };
  const tenantService: any = { getEmpresaId: () => 7 };

  const svc: any = Object.create(ActivosFijosService.prototype);
  svc.logger                 = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.activoRepository       = activoRepository;
  svc.categoriaRepository    = categoriaRepository;
  svc.asientosService        = asientosService;
  svc.configuracionService   = configuracionService;
  svc.tenantService          = tenantService;
  return { svc, asientosService, configuracionService, activoRepository };
}

describe('ActivosFijosService.createActivo() — genera el asiento de alta', () => {
  it('categoría CON cuenta propia: usa esa cuenta, no consulta el default', async () => {
    const categoria = { id: 1, tasaAnual: 25, metodo: MD.LINEA_RECTA, vidaUtilAnios: 4, cuentaActivoCodigo: '1.2.1.02' };
    const { svc, asientosService, configuracionService } = makeService(categoria);

    await svc.createActivo(DTO, 5);

    expect(configuracionService.resolverCuenta).not.toHaveBeenCalled();
    expect(asientosService.asientoAltaActivo).toHaveBeenCalledWith(
      10, 50000, 'ACT-001', '1.2.1.02', '2026-09-19', 5, undefined, false,
    );
  });

  it('categoría SIN cuenta propia: resuelve ACTIVO_FIJO_DEFAULT contra la configuración', async () => {
    const categoria = { id: 1, tasaAnual: 25, metodo: MD.LINEA_RECTA, vidaUtilAnios: 4, cuentaActivoCodigo: null };
    const { svc, asientosService, configuracionService } = makeService(categoria);

    await svc.createActivo(DTO, 5);

    expect(configuracionService.resolverCuenta).toHaveBeenCalledWith(7, 'ACTIVO_FIJO_DEFAULT');
    expect(asientosService.asientoAltaActivo).toHaveBeenCalledWith(
      10, 50000, 'ACT-001', '1.2.1.01', '2026-09-19', 5, undefined, false,
    );
  });

  it('con cuentaContrapartida elegida: la pasa al motor y la marca manual', async () => {
    const categoria = { id: 1, tasaAnual: 25, metodo: MD.LINEA_RECTA, vidaUtilAnios: 4, cuentaActivoCodigo: '1.2.1.02' };
    const { svc, asientosService } = makeService(categoria);

    await svc.createActivo({ ...DTO, cuentaContrapartida: '2.1.1.01' }, 5);

    expect(asientosService.asientoAltaActivo).toHaveBeenCalledWith(
      10, 50000, 'ACT-001', '1.2.1.02', '2026-09-19', 5, '2.1.1.01', true,
    );
  });

  it('cuentaContrapartida NO se guarda como columna del activo', async () => {
    const categoria = { id: 1, tasaAnual: 25, metodo: MD.LINEA_RECTA, vidaUtilAnios: 4, cuentaActivoCodigo: '1.2.1.02' };
    const { svc, activoRepository } = makeService(categoria);

    await svc.createActivo({ ...DTO, cuentaContrapartida: '2.1.1.01' }, 5);

    const datosCreados = activoRepository.create.mock.calls[0][0];
    expect(datosCreados.cuentaContrapartida).toBeUndefined();
  });

  it('si el asiento falla, el activo ya quedó registrado (no se propaga el error)', async () => {
    const categoria = { id: 1, tasaAnual: 25, metodo: MD.LINEA_RECTA, vidaUtilAnios: 4, cuentaActivoCodigo: '1.2.1.02' };
    const { svc, asientosService } = makeService(categoria);
    asientosService.asientoAltaActivo.mockRejectedValueOnce(new Error('boom'));

    const resultado = await svc.createActivo(DTO, 5);

    expect(resultado.id).toBe(10);
  });
});

describe('ActivosFijosService.previsualizarAltaActivo()', () => {
  it('delega en el motor sin registrar el activo', async () => {
    const categoria = { id: 1, tasaAnual: 25, metodo: MD.LINEA_RECTA, vidaUtilAnios: 4, cuentaActivoCodigo: '1.2.1.02' };
    const { svc, asientosService, activoRepository } = makeService(categoria);

    await svc.previsualizarAltaActivo(DTO);

    expect(asientosService.previsualizarAltaActivo).toHaveBeenCalledWith(50000, 'ACT-001', '1.2.1.02', undefined);
    expect(activoRepository.save).not.toHaveBeenCalled();
  });
});
