/**
 * destinoItbis / destinoItbisMotivo — la única regla de validación real:
 * destino='otro' exige el motivo en texto libre (nunca deducible sin decir
 * por qué). El resto (gravado/exportación/exento/activo Cat. I) no necesita
 * texto adicional. Cubre CreateCompraDetalleDto (línea de compra) y
 * CreateGastoDto (gasto).
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCompraDetalleDto } from './create-compra.dto';
import { CreateGastoDto } from '../../gastos/gastos.controller';
import { DestinoItbis } from '../../common/enums/destino-itbis.enum';

async function errores(cls: any, payload: any): Promise<string[]> {
  const inst = plainToInstance(cls, payload, { enableImplicitConversion: true });
  const res  = await validate(inst as object);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}

const baseCompraDetalle = { productoId: 1, cantidad: 1, precioUnitario: 100 };
const baseGasto = { fecha: '2026-09-01', categoria: 'otros', descripcion: 'Compra de prueba', monto: 100 };

describe('CreateCompraDetalleDto.destinoItbis / destinoItbisMotivo', () => {
  it('sin destinoItbis (línea sin clasificar): válido, ningún motivo requerido', async () => {
    const errs = await errores(CreateCompraDetalleDto, baseCompraDetalle);
    expect(errs.join(' ')).not.toMatch(/destinoItbis/i);
  });

  it('destinoItbis=exportacion sin motivo: válido', async () => {
    const errs = await errores(CreateCompraDetalleDto, { ...baseCompraDetalle, destinoItbis: DestinoItbis.EXPORTACION });
    expect(errs.join(' ')).not.toMatch(/destinoItbisMotivo/i);
  });

  it('destinoItbis=exento sin motivo: válido', async () => {
    const errs = await errores(CreateCompraDetalleDto, { ...baseCompraDetalle, destinoItbis: DestinoItbis.EXENTO });
    expect(errs.join(' ')).not.toMatch(/destinoItbisMotivo/i);
  });

  it('destinoItbis=activo_categoria_i sin motivo: válido', async () => {
    const errs = await errores(CreateCompraDetalleDto, { ...baseCompraDetalle, destinoItbis: DestinoItbis.ACTIVO_CATEGORIA_I });
    expect(errs.join(' ')).not.toMatch(/destinoItbisMotivo/i);
  });

  it('destinoItbis=otro SIN motivo: rechaza', async () => {
    const errs = await errores(CreateCompraDetalleDto, { ...baseCompraDetalle, destinoItbis: DestinoItbis.OTRO });
    expect(errs.join(' ')).toMatch(/destinoItbisMotivo/i);
  });

  it('destinoItbis=otro CON motivo: válido', async () => {
    const errs = await errores(CreateCompraDetalleDto, { ...baseCompraDetalle, destinoItbis: DestinoItbis.OTRO, destinoItbisMotivo: 'Compra de muestra para exhibición' });
    expect(errs.join(' ')).not.toMatch(/destinoItbisMotivo/i);
  });

  it('destinoItbis con valor fuera del enum: rechaza', async () => {
    const errs = await errores(CreateCompraDetalleDto, { ...baseCompraDetalle, destinoItbis: 'no_existe' });
    expect(errs.join(' ')).toMatch(/destinoItbis/i);
  });
});

describe('CreateGastoDto.destinoItbis / destinoItbisMotivo — misma regla', () => {
  it('sin destinoItbis: válido', async () => {
    const errs = await errores(CreateGastoDto, baseGasto);
    expect(errs.join(' ')).not.toMatch(/destinoItbis/i);
  });

  it('destinoItbis=otro SIN motivo: rechaza', async () => {
    const errs = await errores(CreateGastoDto, { ...baseGasto, destinoItbis: DestinoItbis.OTRO });
    expect(errs.join(' ')).toMatch(/destinoItbisMotivo/i);
  });

  it('destinoItbis=otro CON motivo: válido', async () => {
    const errs = await errores(CreateGastoDto, { ...baseGasto, destinoItbis: DestinoItbis.OTRO, destinoItbisMotivo: 'Consumo del dueño, no del negocio' });
    expect(errs.join(' ')).not.toMatch(/destinoItbisMotivo/i);
  });
});
