/**
 * ContabilidadService.createCuenta()/updateCuenta() — validaciones de
 * integridad del catálogo (Fase 1 del catálogo fiscal dominicano):
 *
 * 1. cuentaPadreId debe existir (en el tenant) y ser coherente en tipo y
 *    naturaleza con la cuenta que lo referencia — antes no se validaba
 *    nada y se podían crear cuentas huérfanas o incoherentes.
 * 2. Las etiquetas fiscales (tipoGasto606/anexoIR2/casillaIR2/requiereNCF)
 *    solo se ofrecen en cuentas de movimiento de tipo gasto o costo — las
 *    de agrupación no reciben asientos y no se etiquetan.
 *
 * No cubre el seed (seedPlanCuentas no pasa por estas validaciones a
 * propósito — Fase 1 no toca el seed) ni el cruce 606↔IR-2 (Fase 3).
 */

import { ContabilidadService } from './contabilidad.service';
import { TipoCuenta, NaturalezaCuenta, AnexoIR2 } from '../entities/cuenta-contable.entity';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

function makeService(cuentaPorId: Record<number, any> = {}) {
  const cuentaRepository: any = {
    findOne: jest.fn(({ where }: any) => {
      if (where.codigo !== undefined) return Promise.resolve(null); // código libre por defecto
      return Promise.resolve(cuentaPorId[where.id] ?? null);
    }),
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 99, ...data })),
    update: jest.fn().mockResolvedValue({}),
  };
  const tenantService = { getEmpresaId: () => 7 };

  const svc: any = Object.create(ContabilidadService.prototype);
  svc.cuentaRepository = cuentaRepository;
  svc.tenantService    = tenantService;
  return { svc: svc as ContabilidadService, cuentaRepository };
}

const GASTO_MOVIMIENTO = {
  id: 10, nombre: 'Gastos de Personal', tipo: TipoCuenta.GASTO,
  naturaleza: NaturalezaCuenta.DEUDORA, permiteMovimientos: false,
};
const ACTIVO = {
  id: 20, nombre: 'Activos', tipo: TipoCuenta.ACTIVO,
  naturaleza: NaturalezaCuenta.DEUDORA, permiteMovimientos: false,
};

describe('ContabilidadService — validación de cuentaPadreId', () => {
  it('createCuenta: rechaza cuentaPadreId inexistente (404, no huérfanas)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '6.1.1.05', nombre: 'Sueldos', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      cuentaPadreId: 999,
    })).rejects.toThrow(NotFoundException);
  });

  it('createCuenta: rechaza tipo incoherente con el padre', async () => {
    const { svc } = makeService({ 10: GASTO_MOVIMIENTO });
    await expect(svc.createCuenta({
      codigo: '6.1.1.05', nombre: 'Ingreso mal puesto', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 4, permiteMovimientos: true,
      cuentaPadreId: 10,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: rechaza naturaleza incoherente con el padre', async () => {
    const { svc } = makeService({ 10: GASTO_MOVIMIENTO });
    await expect(svc.createCuenta({
      codigo: '6.1.1.05', nombre: 'Naturaleza mal puesta', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 4, permiteMovimientos: true,
      cuentaPadreId: 10,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: acepta un padre coherente en tipo y naturaleza', async () => {
    const { svc, cuentaRepository } = makeService({ 10: GASTO_MOVIMIENTO });
    await svc.createCuenta({
      codigo: '6.1.1.05', nombre: 'Sueldos', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      cuentaPadreId: 10,
    });
    expect(cuentaRepository.save).toHaveBeenCalled();
  });

  it('createCuenta: una cuenta raíz (sin cuentaPadreId) no dispara la validación de padre', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '9', nombre: 'Cuenta raíz', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 1, permiteMovimientos: false,
    });
    expect(cuentaRepository.save).toHaveBeenCalled();
  });

  it('updateCuenta: rechaza que una cuenta sea su propio padre', async () => {
    const { svc } = makeService({ 10: GASTO_MOVIMIENTO });
    await expect(svc.updateCuenta(10, { cuentaPadreId: 10 }))
      .rejects.toThrow(BadRequestException);
  });

  it('updateCuenta: valida coherencia contra el padre usando el tipo/naturaleza YA guardados cuando el DTO no los toca', async () => {
    const hija = { id: 30, nombre: 'Comisiones', tipo: TipoCuenta.INGRESO, naturaleza: NaturalezaCuenta.ACREEDORA, permiteMovimientos: true };
    const { svc } = makeService({ 10: GASTO_MOVIMIENTO, 30: hija });
    // El DTO solo cambia cuentaPadreId — el tipo/naturaleza efectivos deben salir de "hija" (INGRESO/ACREEDORA),
    // que no coincide con GASTO_MOVIMIENTO (GASTO/DEUDORA) → debe rechazar.
    await expect(svc.updateCuenta(30, { cuentaPadreId: 10 }))
      .rejects.toThrow(BadRequestException);
  });
});

describe('ContabilidadService — etiquetas fiscales solo en gasto/costo de movimiento', () => {
  it('createCuenta: rechaza etiqueta fiscal en una cuenta que no es gasto ni costo', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '1.1.1.05', nombre: 'Banco mal etiquetado', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      tipoGasto606: '01',
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: rechaza etiqueta fiscal en una cuenta de agrupación (permiteMovimientos=false)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '6.1', nombre: 'Gastos Operativos', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 2, permiteMovimientos: false,
      requiereNCF: true,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: acepta las 4 etiquetas en una cuenta de gasto de movimiento', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '6.1.1.05', nombre: 'Sueldos', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      tipoGasto606: '01', anexoIR2: AnexoIR2.B1, casillaIR2: '6.1', requiereNCF: false,
    });
    expect(cuentaRepository.save).toHaveBeenCalled();
  });

  it('createCuenta: acepta las etiquetas en una cuenta de costo de movimiento', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '5.1.1.01', nombre: 'Costo de Ventas', tipo: TipoCuenta.COSTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      tipoGasto606: '09', anexoIR2: AnexoIR2.D, casillaIR2: '9.1', requiereNCF: true,
    });
    expect(cuentaRepository.save).toHaveBeenCalled();
  });

  it('updateCuenta: rechaza agregar una etiqueta fiscal a una cuenta de ingreso ya existente', async () => {
    const ingresoMovimiento = { id: 40, nombre: 'Ventas', tipo: TipoCuenta.INGRESO, naturaleza: NaturalezaCuenta.ACREEDORA, permiteMovimientos: true };
    const { svc } = makeService({ 40: ingresoMovimiento });
    await expect(svc.updateCuenta(40, { requiereNCF: true }))
      .rejects.toThrow(BadRequestException);
  });

  it('updateCuenta: acepta etiqueta fiscal sobre una cuenta de gasto de movimiento ya existente, sin repetir tipo/permiteMovimientos en el DTO', async () => {
    const { svc, cuentaRepository } = makeService({ 10: GASTO_MOVIMIENTO });
    // GASTO_MOVIMIENTO tiene permiteMovimientos:false en este fixture — usamos otra cuenta que sí sea de movimiento.
    const gastoDeMovimiento = { id: 11, nombre: 'Comisiones Bancarias', tipo: TipoCuenta.GASTO, naturaleza: NaturalezaCuenta.DEUDORA, permiteMovimientos: true };
    const { svc: svc2, cuentaRepository: repo2 } = makeService({ 11: gastoDeMovimiento });
    await svc2.updateCuenta(11, { tipoGasto606: '07' });
    expect(repo2.update).toHaveBeenCalledWith(11, { tipoGasto606: '07' });
  });
});

describe('ContabilidadService — código duplicado sigue rechazándose antes de validar padre/etiquetas', () => {
  it('createCuenta: código ya existente lanza ConflictException sin llegar a validar cuentaPadreId', async () => {
    const cuentaRepository: any = {
      findOne: jest.fn().mockResolvedValue({ id: 1, codigo: '6.1.1.05' }),
    };
    const svc: any = Object.create(ContabilidadService.prototype);
    svc.cuentaRepository = cuentaRepository;
    svc.tenantService    = { getEmpresaId: () => 7 };

    await expect(svc.createCuenta({
      codigo: '6.1.1.05', nombre: 'Duplicada', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      cuentaPadreId: 999, // ni siquiera se llega a resolver este padre inexistente
    })).rejects.toThrow(ConflictException);
  });
});
