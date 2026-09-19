/**
 * ContabilidadService.createCuenta()/updateCuenta() — validaciones de
 * integridad del catálogo (Fase 1 del catálogo fiscal dominicano):
 *
 * 1. cuentaPadreId debe existir (en el tenant) y ser coherente en tipo y
 *    naturaleza con la cuenta que lo referencia — antes no se validaba
 *    nada y se podían crear cuentas huérfanas o incoherentes.
 * 2. Etiquetas fiscales, todas solo en cuentas de movimiento
 *    (permiteMovimientos=true); la restricción de TIPO difiere por
 *    etiqueta (corrección del 2026-09-19 — la primera versión restringía
 *    las 4 a "gasto o costo", lo que dejaba a ninguna cuenta real poder
 *    llevar anexoIR2='A1', que es del Balance General):
 *      - tipoGasto606/requiereNCF: solo gasto o costo (el 606 declara
 *        compras y gastos, no partidas de balance).
 *      - anexoIR2/casillaIR2: cualquier tipo, coherente con
 *        TIPOS_POR_ANEXO_IR2 (A1→activo/pasivo/patrimonio,
 *        B1→ingreso/costo/gasto, D→activo/costo).
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

describe('ContabilidadService — tipoGasto606/requiereNCF: solo gasto o costo de movimiento', () => {
  it('createCuenta: rechaza tipoGasto606 en una cuenta que no es gasto ni costo', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '1.1.1.05', nombre: 'Banco mal etiquetado', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      tipoGasto606: '01',
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: rechaza requiereNCF en una cuenta de agrupación (permiteMovimientos=false)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '6.1', nombre: 'Gastos Operativos', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 2, permiteMovimientos: false,
      requiereNCF: true,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: acepta tipoGasto606 y requiereNCF en una cuenta de gasto de movimiento', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '6.1.1.05', nombre: 'Sueldos', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      tipoGasto606: '01', requiereNCF: false,
    });
    expect(cuentaRepository.save).toHaveBeenCalled();
  });

  it('createCuenta: acepta tipoGasto606 y requiereNCF en una cuenta de costo de movimiento', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '5.1.1.01', nombre: 'Costo de Ventas', tipo: TipoCuenta.COSTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      tipoGasto606: '09', requiereNCF: true,
    });
    expect(cuentaRepository.save).toHaveBeenCalled();
  });

  it('updateCuenta: rechaza agregar requiereNCF a una cuenta de ingreso ya existente', async () => {
    const ingresoMovimiento = { id: 40, nombre: 'Ventas', tipo: TipoCuenta.INGRESO, naturaleza: NaturalezaCuenta.ACREEDORA, permiteMovimientos: true };
    const { svc } = makeService({ 40: ingresoMovimiento });
    await expect(svc.updateCuenta(40, { requiereNCF: true }))
      .rejects.toThrow(BadRequestException);
  });

  it('updateCuenta: acepta tipoGasto606 sobre una cuenta de gasto de movimiento ya existente, sin repetir tipo/permiteMovimientos en el DTO', async () => {
    const gastoDeMovimiento = { id: 11, nombre: 'Comisiones Bancarias', tipo: TipoCuenta.GASTO, naturaleza: NaturalezaCuenta.DEUDORA, permiteMovimientos: true };
    const { svc, cuentaRepository } = makeService({ 11: gastoDeMovimiento });
    await svc.updateCuenta(11, { tipoGasto606: '07' });
    expect(cuentaRepository.update).toHaveBeenCalledWith(11, { tipoGasto606: '07' });
  });
});

describe('ContabilidadService — anexoIR2/casillaIR2: cualquier tipo, coherente con TIPOS_POR_ANEXO_IR2', () => {
  it('createCuenta: A1 (Balance) se acepta en una cuenta de tipo activo de movimiento', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '1.1.3.01', nombre: 'Mercancías para la Venta', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.A1, casillaIR2: 'inv_ini_merc',
    });
    expect(cuentaRepository.save).toHaveBeenCalled();
  });

  it('createCuenta: A1 (Balance) se acepta en pasivo y en patrimonio', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '2.1.1.01', nombre: 'Proveedores', tipo: TipoCuenta.PASIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.A1,
    });
    await svc.createCuenta({
      codigo: '3.1.01', nombre: 'Capital Social', tipo: TipoCuenta.PATRIMONIO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.A1,
    });
    expect(cuentaRepository.save).toHaveBeenCalledTimes(2);
  });

  it('createCuenta: rechaza A1 en una cuenta de tipo gasto (A1 es del Balance, no de Resultados)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '6.1.1.06', nombre: 'Mal puesta', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.A1,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: B1 (Resultados) se acepta en ingreso, costo y gasto', async () => {
    const { svc, cuentaRepository } = makeService({});
    for (const tipo of [TipoCuenta.INGRESO, TipoCuenta.COSTO, TipoCuenta.GASTO]) {
      await svc.createCuenta({
        codigo: `x.${tipo}`, nombre: `Cuenta ${tipo}`, tipo,
        naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
        anexoIR2: AnexoIR2.B1, casillaIR2: '6.1',
      });
    }
    expect(cuentaRepository.save).toHaveBeenCalledTimes(3);
  });

  it('createCuenta: rechaza B1 en una cuenta de tipo activo (B1 es de Resultados, no de Balance)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '1.1.1.06', nombre: 'Mal puesta', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.B1,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: D (Costo de Venta) se acepta en activo (Inventario Inicial/Final) y en costo (Compras/Costo de Venta)', async () => {
    const { svc, cuentaRepository } = makeService({});
    await svc.createCuenta({
      codigo: '1.1.3.01', nombre: 'Mercancías para la Venta', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.D, casillaIR2: 'inv_ini_merc',
    });
    await svc.createCuenta({
      codigo: '5.1.1.01', nombre: 'Costo de Ventas', tipo: TipoCuenta.COSTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.D, casillaIR2: 'costo_venta',
    });
    expect(cuentaRepository.save).toHaveBeenCalledTimes(2);
  });

  it('createCuenta: rechaza D en una cuenta de tipo gasto (el Anexo D no toca gastos operativos)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '6.1.1.07', nombre: 'Mal puesta', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      anexoIR2: AnexoIR2.D,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: rechaza casillaIR2 sin anexoIR2 (no puede haber línea sin anexo)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '1.1.1.07', nombre: 'Sin anexo', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 4, permiteMovimientos: true,
      casillaIR2: '6.1',
    })).rejects.toThrow(BadRequestException);
  });

  it('createCuenta: rechaza anexoIR2 en una cuenta de agrupación (permiteMovimientos=false)', async () => {
    const { svc } = makeService({});
    await expect(svc.createCuenta({
      codigo: '1.1', nombre: 'Activo Corriente', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 2, permiteMovimientos: false,
      anexoIR2: AnexoIR2.A1,
    })).rejects.toThrow(BadRequestException);
  });

  it('updateCuenta: rechaza cambiar el tipo de una cuenta ya etiquetada con D a uno incompatible (gasto)', async () => {
    const cuentaD = { id: 50, nombre: 'Costo de Ventas', tipo: TipoCuenta.COSTO, naturaleza: NaturalezaCuenta.DEUDORA, permiteMovimientos: true, anexoIR2: AnexoIR2.D };
    const { svc } = makeService({ 50: cuentaD });
    await expect(svc.updateCuenta(50, { tipo: TipoCuenta.GASTO }))
      .rejects.toThrow(BadRequestException);
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
