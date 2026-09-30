import { BadRequestException } from '@nestjs/common';
import { InventarioService } from './inventario.service';

/**
 * FIX DEFENSIVO — pre-requisito de HiCloud Xlink (2026-09-29).
 *
 * obtenerProducto() es el único punto de entrada por el que TODOS los
 * métodos públicos de este servicio resuelven un `productoId`. Sin esta
 * guarda, un `productoId` undefined/null/no-entero llegaba tal cual al
 * `where` de TypeORM: con `undefined`, `findOne` OMITE esa clave del WHERE
 * en vez de fallar, y devuelve el PRIMER producto que matchee de la
 * empresa — corrompiendo el stock de un producto arbitrario en silencio,
 * nunca un 404. Vía HTTP esto ya estaba cubierto por ParseIntPipe/DTOs,
 * pero Xlink va a llamar a `registrarEntrada` desde otro servicio
 * (ComprasService, dentro de `recibir()`), sin pasar por ningún pipe —
 * exactamente el camino que esta guarda cierra.
 */

const EMPRESA = 7;

function buildDeps() {
  return {
    movimientoRepo: { create: jest.fn(), save: jest.fn() },
    productoRepo: {
      findOne: jest.fn().mockResolvedValue({ id: 42, empresaId: EMPRESA, stock: 10, stockMinimo: 0 }),
      update:  jest.fn().mockResolvedValue(undefined),
    },
    loteRepo: {}, serialRepo: {}, solicitudAjusteRepo: {},
    ds: { query: jest.fn().mockResolvedValue([]) },
    realtimeSvc: { notify: jest.fn() },
    tenantSvc:   { getEmpresaId: () => EMPRESA },
    emailSvc:    {},
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): InventarioService {
  return new InventarioService(
    d.movimientoRepo as any, d.productoRepo as any, d.loteRepo as any, d.serialRepo as any,
    d.solicitudAjusteRepo as any, d.ds as any, d.realtimeSvc as any, d.tenantSvc as any,
    d.emailSvc as any, d.valoracionSvc as any,
  );
}

describe('InventarioService — productoId inválido nunca llega a una query', () => {
  it('registrarEntrada(undefined, ...) lanza BadRequestException y NO toca ningún stock', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await expect(service.registrarEntrada(undefined as any, 5, 1)).rejects.toBeInstanceOf(BadRequestException);

    expect(d.productoRepo.findOne).not.toHaveBeenCalled();
    expect(d.productoRepo.update).not.toHaveBeenCalled();
  });

  it('registrarEntrada(null, ...) también lanza', async () => {
    const d = buildDeps();
    const service = buildService(d);
    await expect(service.registrarEntrada(null as any, 5, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(d.productoRepo.findOne).not.toHaveBeenCalled();
  });

  it('registrarEntrada(0, ...) lanza — 0 no es un id válido', async () => {
    const d = buildDeps();
    const service = buildService(d);
    await expect(service.registrarEntrada(0, 5, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registrarEntrada(-3, ...) lanza — negativo no es válido', async () => {
    const d = buildDeps();
    const service = buildService(d);
    await expect(service.registrarEntrada(-3, 5, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registrarEntrada(1.5, ...) lanza — no es un entero', async () => {
    const d = buildDeps();
    const service = buildService(d);
    await expect(service.registrarEntrada(1.5, 5, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registrarEntrada(42, ...) con id válido SÍ llega a la query — la guarda no bloquea el caso normal', async () => {
    const d = buildDeps();
    const service = buildService(d);
    await service.registrarEntrada(42, 5, 1);
    expect(d.productoRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('registrarSalida(undefined, ...) también lanza (mismo choke point: obtenerProducto)', async () => {
    const d = buildDeps();
    const service = buildService(d);
    await expect(service.registrarSalida(undefined as any, 5, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(d.productoRepo.findOne).not.toHaveBeenCalled();
  });

  it('registrarAjuste(undefined, ...) también lanza', async () => {
    const d = buildDeps();
    const service = buildService(d);
    await expect(service.registrarAjuste(undefined as any, 5, 1, 'motivo')).rejects.toBeInstanceOf(BadRequestException);
    expect(d.productoRepo.findOne).not.toHaveBeenCalled();
  });
});
