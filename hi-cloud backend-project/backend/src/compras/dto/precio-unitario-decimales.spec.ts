/**
 * precioUnitario en Compras — bug real (ELIDO SEPULVEDA, admin, 2026-10-03):
 * ráfaga de 400 en POST /compras/previsualizar-asiento, "detalles.0.precioUnitario
 * must be a number conforming to the specified constraints". Dos causas:
 *
 * 1. CreateCompraDetalleDto.precioUnitario solo aceptaba 2 decimales — el
 *    resto del sistema (facturas) acepta 4. El toggle "precio c/ITBIS" del
 *    formulario de compras calcula el precio neto dividiendo entre
 *    (1 + %ITBIS/100), que casi nunca da un resultado de 2 decimales
 *    exactos — el 400 era determinístico, no ocasional, y pasaba igual en
 *    create()/update() (MISMO DTO que previsualizar-asiento).
 * 2. previsualizar-asiento usaba ese mismo DTO estricto aunque el frontend
 *    la llama con debounce mientras el usuario sigue escribiendo —
 *    PrevisualizarCompraDto/PrevisualizarCompraDetalleDto existen para
 *    tolerar líneas incompletas sin devolver 400.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCompraDetalleDto } from './create-compra.dto';
import { PrevisualizarCompraDetalleDto, PrevisualizarCompraDto } from './previsualizar-compra.dto';

async function errores(cls: any, payload: any): Promise<string[]> {
  const inst = plainToInstance(cls, payload, { enableImplicitConversion: true });
  const res  = await validate(inst as object);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('CreateCompraDetalleDto.precioUnitario — hasta 4 decimales', () => {
  it('4 decimales: válido (precio neto típico de "quitarle el ITBIS")', async () => {
    const errs = await errores(CreateCompraDetalleDto, { productoId: 1, cantidad: 1, precioUnitario: 84.7458 });
    expect(errs.join(' ')).not.toMatch(/precioUnitario/i);
  });

  it('2 decimales (el caso de siempre): sigue válido', async () => {
    const errs = await errores(CreateCompraDetalleDto, { productoId: 1, cantidad: 1, precioUnitario: 125.50 });
    expect(errs.join(' ')).not.toMatch(/precioUnitario/i);
  });

  it('precio mandado como string numérico: se convierte, no se rechaza (@Type(() => Number))', async () => {
    const errs = await errores(CreateCompraDetalleDto, { productoId: 1, cantidad: 1, precioUnitario: '125.50' as any });
    expect(errs.join(' ')).not.toMatch(/precioUnitario/i);
  });

  it('5 decimales: sigue siendo inválido (el tope es 4, no infinito)', async () => {
    const errs = await errores(CreateCompraDetalleDto, { productoId: 1, cantidad: 1, precioUnitario: 84.74576 });
    expect(errs.join(' ')).toMatch(/precioUnitario/i);
  });
});

describe('PrevisualizarCompraDto — tolera líneas incompletas (sin 400 mientras el usuario escribe)', () => {
  it('línea con producto+cantidad pero SIN precioUnitario: válida (incompleta, no inválida)', async () => {
    const errs = await errores(PrevisualizarCompraDto, {
      proveedorId: 1, fecha: '2026-10-03',
      detalles: [{ productoId: 1, cantidad: 5 }],
    });
    expect(errs).toHaveLength(0);
  });

  it('línea completamente vacía ({}): válida a nivel DTO (el service la filtra, no el validador)', async () => {
    const errs = await errores(PrevisualizarCompraDetalleDto, {});
    expect(errs).toHaveLength(0);
  });

  it('detalles ausente del todo: válido (el service devuelve el preview en cero)', async () => {
    const errs = await errores(PrevisualizarCompraDto, { proveedorId: 1, fecha: '2026-10-03' });
    expect(errs).toHaveLength(0);
  });

  it('precioUnitario con texto no numérico: el DTO lo convierte a NaN — el filtro de ComprasService.previsualizarAsiento (no el validador) es lo que la descarta, ver compras-previsualizar-lineas-incompletas.spec.ts', async () => {
    const inst = plainToInstance(PrevisualizarCompraDto, {
      proveedorId: 1, fecha: '2026-10-03',
      detalles: [{ productoId: 1, cantidad: 5, precioUnitario: 'no-es-un-numero' as any }],
    }, { enableImplicitConversion: true });
    expect(Number.isNaN((inst.detalles as any)[0].precioUnitario)).toBe(true);
  });
});
