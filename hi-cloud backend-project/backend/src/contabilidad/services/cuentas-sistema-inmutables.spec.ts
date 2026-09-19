/**
 * P3 Bloque 4 — cuentas del sistema inmutables. El motor de asientos
 * automáticos referencia cuentas por CÓDIGO (COD.* en
 * asientos-automaticos.service.ts), no por id. Antes de este bloque, el
 * código de cualquier cuenta era editable sin restricción — si un
 * contador renombraba "Caja General" o "Ventas", ese tipo de asiento
 * dejaba de encontrar la cuenta y moría en silencio para toda la empresa.
 *
 * Cubre dos cosas distintas:
 * 1. PLAN_CUENTAS marca esCuentaSistema=true en los códigos de COD.* que
 *    existen en el seed (17 de los 20 originales) MÁS los 8 códigos
 *    huérfanos que se agregaron al catálogo el 2026-09-19 (3 de COD.* que
 *    no existían — GANANCIA_CAMBIARIA, PERDIDA_CAMBIARIA,
 *    ISR_RET_POR_PAGAR — y 5 literales sueltos que el motor referencia
 *    directo, fuera de COD.*, con el mismo riesgo) — 25 en total.
 * 2. ContabilidadService bloquea cambiar el código y desactivar esas
 *    cuentas — el nombre y la descripción siguen editables libremente.
 */

import { ContabilidadService, PLAN_CUENTAS } from './contabilidad.service';
import { TipoCuenta, NaturalezaCuenta } from '../entities/cuenta-contable.entity';
import { BadRequestException } from '@nestjs/common';

const CODIGOS_SISTEMA_ESPERADOS = [
  '1.1.1.02', '1.1.1.03', '1.1.2.01', '1.1.2.10', '1.1.3.01', '1.1.4.01', '1.1.4.02', '1.1.4.03',
  '2.1.1.01', '2.1.2.01', '2.1.2.02', '2.1.2.03', '2.1.2.04', '2.1.3.01', '2.1.3.02', '2.1.5.01', '2.1.6.01',
  '4.1.1.01', '4.1.2.01', '4.1.2.02', '4.1.3.01',
  '5.1.1.01',
  '6.1.1.01', '6.1.1.02', '6.1.5.01',
];

describe('PLAN_CUENTAS — esCuentaSistema', () => {
  it('marca esCuentaSistema=true exactamente en los 25 códigos que el motor referencia (COD.* + literales sueltos)', () => {
    const marcadas = PLAN_CUENTAS.filter((c) => c.esCuentaSistema).map((c) => c.codigo).sort();
    expect(marcadas).toEqual([...CODIGOS_SISTEMA_ESPERADOS].sort());
  });

  it('ninguna cuenta de agrupación (permiteMovimientos=false) queda marcada — ningún código de COD.* apunta a una', () => {
    for (const c of PLAN_CUENTAS) {
      if (c.esCuentaSistema) expect(c.permiteMovimientos).toBe(true);
    }
  });

  it('una cuenta cualquiera fuera de COD.* (ej. Documentos por Cobrar) no queda marcada', () => {
    const c = PLAN_CUENTAS.find((x) => x.codigo === '1.1.2.02');
    expect(c?.esCuentaSistema).toBeUndefined();
  });
});

function makeService(cuenta: any) {
  const cuentaRepository: any = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn().mockResolvedValue({}),
  };
  const lineaRepository: any = { count: jest.fn().mockResolvedValue(0) };
  const svc: any = Object.create(ContabilidadService.prototype);
  svc.cuentaRepository = cuentaRepository;
  svc.lineaRepository  = lineaRepository;
  svc.tenantService    = { getEmpresaId: () => 7 };
  return { svc: svc as ContabilidadService, cuentaRepository, lineaRepository };
}

const CUENTA_SISTEMA = {
  id: 5, codigo: '1.1.1.02', nombre: 'Caja General', tipo: TipoCuenta.ACTIVO,
  naturaleza: NaturalezaCuenta.DEUDORA, permiteMovimientos: true, isActive: true, esCuentaSistema: true,
};
const CUENTA_NORMAL = {
  id: 6, codigo: '6.1.2.09', nombre: 'Gasto Custom', tipo: TipoCuenta.GASTO,
  naturaleza: NaturalezaCuenta.DEUDORA, permiteMovimientos: true, isActive: true, esCuentaSistema: false,
};

describe('ContabilidadService.updateCuenta() — bloquea el código de una cuenta del sistema', () => {
  it('rechaza cambiar el código de una cuenta del sistema', async () => {
    const { svc } = makeService(CUENTA_SISTEMA);
    await expect(svc.updateCuenta(5, { codigo: '1.1.1.99' }))
      .rejects.toThrow(BadRequestException);
  });

  it('permite editar el nombre y la descripción de una cuenta del sistema, sin tocar el código', async () => {
    const { svc, cuentaRepository } = makeService(CUENTA_SISTEMA);
    await svc.updateCuenta(5, { nombre: 'Caja General — Sucursal Piantini', descripcion: 'Renombrada por el contador' });
    expect(cuentaRepository.update).toHaveBeenCalledWith(5, { nombre: 'Caja General — Sucursal Piantini', descripcion: 'Renombrada por el contador' });
  });

  it('enviar el MISMO código que ya tenía no se rechaza (no es un cambio real)', async () => {
    const { svc, cuentaRepository } = makeService(CUENTA_SISTEMA);
    await svc.updateCuenta(5, { codigo: '1.1.1.02', nombre: 'Caja General' });
    expect(cuentaRepository.update).toHaveBeenCalled();
  });

  it('una cuenta normal (no de sistema) sí puede cambiar de código', async () => {
    const { svc, cuentaRepository } = makeService(CUENTA_NORMAL);
    await svc.updateCuenta(6, { codigo: '6.1.2.10' });
    expect(cuentaRepository.update).toHaveBeenCalledWith(6, { codigo: '6.1.2.10' });
  });
});

describe('ContabilidadService.removeCuenta() — bloquea desactivar una cuenta del sistema', () => {
  it('rechaza desactivar una cuenta del sistema', async () => {
    const { svc, cuentaRepository } = makeService(CUENTA_SISTEMA);
    await expect(svc.removeCuenta(5)).rejects.toThrow(BadRequestException);
    expect(cuentaRepository.update).not.toHaveBeenCalled();
  });

  it('una cuenta normal (no de sistema) sí puede desactivarse', async () => {
    const { svc, cuentaRepository } = makeService(CUENTA_NORMAL);
    await svc.removeCuenta(6);
    expect(cuentaRepository.update).toHaveBeenCalledWith(6, { isActive: false });
  });
});
