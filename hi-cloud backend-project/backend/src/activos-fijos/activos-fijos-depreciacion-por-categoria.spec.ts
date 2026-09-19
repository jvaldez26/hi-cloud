/**
 * ActivosFijosService.procesarDepreciacionMensual() — selector de cuenta
 * contable (2026-09-19). CategoriaActivo.cuentaGastoCodigo/
 * cuentaDepreciacionCodigo ya existían (seed + formulario de categoría
 * custom) pero ninguna lectura las usaba: el asiento de depreciación
 * siempre iba a las mismas 2 cuentas fijas del motor (6.2.1.01/1.2.2.01),
 * sin importar la categoría del activo. Ahora se agrupa por el par de
 * cuentas de cada categoría antes de llamar al motor.
 */

import { ActivosFijosService } from './activos-fijos.service';
import { EstadoActivo as EA } from './entities/activo-fijo.entity';
import { MetodoDepreciacion as MD } from './entities/categoria-activo.entity';

function makeActivo(overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? 1,
    estado: EA.ACTIVO,
    isActive: true,
    fechaAdquisicion: '2025-01-01',
    costoAdquisicion: 12000,
    valorResidual: 0,
    valorLibros: 12000,
    vidaUtilAnios: 4,
    depreciacionAcumulada: 0,
    categoria: {
      tasaAnual: 25,
      metodo: MD.LINEA_RECTA,
      cuentaGastoCodigo: null,
      cuentaDepreciacionCodigo: null,
    },
    ...overrides,
  };
}

function makeService(activos: any[]) {
  const activoRepository: any = {
    find:   jest.fn().mockResolvedValue(activos),
    update: jest.fn().mockResolvedValue({}),
  };
  const depreciacionRepository: any = {
    count:  jest.fn().mockResolvedValue(0),
    create: jest.fn((data: any) => data),
    save:   jest.fn().mockResolvedValue({}),
  };
  const asientosService: any = { asientoDepreciacion: jest.fn().mockResolvedValue(undefined) };
  const tenantService: any = { getEmpresaId: () => 7 };

  const svc: any = Object.create(ActivosFijosService.prototype);
  svc.logger                 = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.activoRepository       = activoRepository;
  svc.depreciacionRepository = depreciacionRepository;
  svc.asientosService        = asientosService;
  svc.tenantService          = tenantService;
  return { svc: svc as ActivosFijosService, asientosService };
}

describe('ActivosFijosService.procesarDepreciacionMensual() — desglose por categoría', () => {
  it('categoría SIN cuentas propias (nullable): usa el fallback 6.2.1.01/1.2.2.01, igual que antes', async () => {
    const { svc, asientosService } = makeService([makeActivo()]);
    await svc.procesarDepreciacionMensual('2026-09', 5);

    const desglose = asientosService.asientoDepreciacion.mock.calls[0][0];
    expect(desglose).toEqual([{ cuentaGasto: '6.2.1.01', cuentaDepreciacion: '1.2.2.01', monto: expect.any(Number) }]);
  });

  it('categoría CON cuentas propias: se usan esas, no el fallback', async () => {
    const activo = makeActivo({
      categoria: { tasaAnual: 25, metodo: MD.LINEA_RECTA, cuentaGastoCodigo: '6.2.1.05', cuentaDepreciacionCodigo: '1.2.2.05' },
    });
    const { svc, asientosService } = makeService([activo]);
    await svc.procesarDepreciacionMensual('2026-09', 5);

    const desglose = asientosService.asientoDepreciacion.mock.calls[0][0];
    expect(desglose).toEqual([{ cuentaGasto: '6.2.1.05', cuentaDepreciacion: '1.2.2.05', monto: expect.any(Number) }]);
  });

  it('dos activos de categorías con cuentas DISTINTAS: el desglose trae 2 entradas, una por par de cuentas', async () => {
    const activoA = makeActivo({ id: 1, categoria: { tasaAnual: 25, metodo: MD.LINEA_RECTA, cuentaGastoCodigo: '6.2.1.05', cuentaDepreciacionCodigo: '1.2.2.05' } });
    const activoB = makeActivo({ id: 2, categoria: { tasaAnual: 25, metodo: MD.LINEA_RECTA, cuentaGastoCodigo: '6.2.1.06', cuentaDepreciacionCodigo: '1.2.2.06' } });
    const { svc, asientosService } = makeService([activoA, activoB]);
    await svc.procesarDepreciacionMensual('2026-09', 5);

    const desglose = asientosService.asientoDepreciacion.mock.calls[0][0];
    expect(desglose).toHaveLength(2);
    expect(desglose.map((d: any) => d.cuentaGasto).sort()).toEqual(['6.2.1.05', '6.2.1.06']);
  });

  it('dos activos de la MISMA categoría: se suman en una sola entrada del desglose', async () => {
    const cat = { tasaAnual: 25, metodo: MD.LINEA_RECTA, cuentaGastoCodigo: '6.2.1.05', cuentaDepreciacionCodigo: '1.2.2.05' };
    const activoA = makeActivo({ id: 1, costoAdquisicion: 12000, valorLibros: 12000, categoria: cat });
    const activoB = makeActivo({ id: 2, costoAdquisicion: 8000,  valorLibros: 8000,  categoria: cat });
    const { svc, asientosService } = makeService([activoA, activoB]);
    await svc.procesarDepreciacionMensual('2026-09', 5);

    const desglose = asientosService.asientoDepreciacion.mock.calls[0][0];
    expect(desglose).toHaveLength(1);
    // (12000/48) + (8000/48) = 250 + 166.67
    expect(desglose[0].monto).toBeCloseTo(250 + 166.67, 1);
  });
});
