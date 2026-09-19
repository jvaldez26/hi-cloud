/**
 * ContabilidadService.getCuentasSinEtiquetar() — la lista de trabajo del
 * contador (Fase 2 del catálogo fiscal dominicano, pantalla de
 * excepciones). Mismo criterio "OR por campo aplicable" que la columna
 * "606 / IR-2" de PlanCuentasPage.tsx.
 */

import { ContabilidadService } from './contabilidad.service';
import { TipoCuenta, NaturalezaCuenta, AnexoIR2 } from '../entities/cuenta-contable.entity';

function makeService(cuentas: any[]) {
  const cuentaRepository: any = { find: jest.fn().mockResolvedValue(cuentas) };
  const svc: any = Object.create(ContabilidadService.prototype);
  svc.cuentaRepository = cuentaRepository;
  svc.tenantService    = { getEmpresaId: () => 7 };
  return { svc: svc as ContabilidadService, cuentaRepository };
}

const base = { permiteMovimientos: true, naturaleza: NaturalezaCuenta.DEUDORA, isActive: true };

describe('ContabilidadService.getCuentasSinEtiquetar()', () => {
  it('gasto sin tipoGasto606 aparece, aunque ya tenga anexoIR2 (caso ITBIS no Recuperable)', async () => {
    const { svc } = makeService([
      { ...base, id: 1, codigo: '6.1.2.06', nombre: 'ITBIS no Recuperable', tipo: TipoCuenta.GASTO, tipoGasto606: null, anexoIR2: null },
    ]);
    const r = await svc.getCuentasSinEtiquetar();
    expect(r).toHaveLength(1);
  });

  it('costo con tipoGasto606 pero SIN anexoIR2 aparece (caso de Inventario/Costo con anexo dual sin resolver)', async () => {
    const { svc } = makeService([
      { ...base, id: 2, codigo: '5.1.1.01', nombre: 'Costo de Ventas de Bienes', tipo: TipoCuenta.COSTO, tipoGasto606: '09', anexoIR2: null },
    ]);
    const r = await svc.getCuentasSinEtiquetar();
    expect(r).toHaveLength(1);
  });

  it('activo sin anexoIR2 aparece — tipoGasto606 nunca le aplica, así que no cuenta contra ella', async () => {
    const { svc } = makeService([
      { ...base, id: 3, codigo: '1.1.3.01', nombre: 'Mercancías para la Venta', tipo: TipoCuenta.ACTIVO, tipoGasto606: null, anexoIR2: null },
    ]);
    const r = await svc.getCuentasSinEtiquetar();
    expect(r).toHaveLength(1);
  });

  it('gasto con tipoGasto606 Y anexoIR2 completos no aparece', async () => {
    const { svc } = makeService([
      { ...base, id: 4, codigo: '6.1.1.01', nombre: 'Sueldos y Salarios', tipo: TipoCuenta.GASTO, tipoGasto606: '01', anexoIR2: AnexoIR2.B1 },
    ]);
    const r = await svc.getCuentasSinEtiquetar();
    expect(r).toHaveLength(0);
  });

  it('activo con anexoIR2 completo no aparece', async () => {
    const { svc } = makeService([
      { ...base, id: 5, codigo: '1.1.1.01', nombre: 'Caja Chica', tipo: TipoCuenta.ACTIVO, tipoGasto606: null, anexoIR2: AnexoIR2.A1 },
    ]);
    const r = await svc.getCuentasSinEtiquetar();
    expect(r).toHaveLength(0);
  });

  it('solo consulta cuentas de movimiento activas (permiteMovimientos + isActive) — el find() ya filtra en la base de datos', async () => {
    const { svc, cuentaRepository } = makeService([]);
    await svc.getCuentasSinEtiquetar();
    expect(cuentaRepository.find).toHaveBeenCalledWith({
      where: { isActive: true, permiteMovimientos: true, empresaId: 7 },
      order: { codigo: 'ASC' },
    });
  });
});
