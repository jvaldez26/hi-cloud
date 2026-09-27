/**
 * @IsValidNCF() cableado en los 4 campos que capturan un NCF de PROVEEDOR
 * (comprobante de un tercero, no el e-CF que HiCloud emite ni una secuencia
 * interna). Ver ncf.validator.spec.ts para el algoritmo en sí.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCompraDto } from '../../compras/dto/create-compra.dto';
import { UpdateNcfProveedorDto } from '../../compras/dto/update-ncf-proveedor.dto';
import { CreateGastoDto } from '../../gastos/gastos.controller';
import { CreateNCCDto } from '../../notas-credito-compras/notas-credito-compras.controller';

async function errores(cls: any, payload: any): Promise<string[]> {
  const inst = plainToInstance(cls, payload, { enableImplicitConversion: true });
  const res  = await validate(inst as object);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}

const baseCompra = {
  proveedorId: 1, fecha: '2026-09-27',
  detalles: [{ productoId: 1, cantidad: 1, precioUnitario: 100 }],
};

describe('CreateCompraDto.numeroFacturaProveedor', () => {
  it('sin NCF: válido (campo opcional)', async () => {
    const errs = await errores(CreateCompraDto, baseCompra);
    expect(errs.join(' ')).not.toMatch(/NCF/i);
  });
  it('e-NCF válido (E320000006814)', async () => {
    const errs = await errores(CreateCompraDto, { ...baseCompra, numeroFacturaProveedor: 'E320000006814' });
    expect(errs.join(' ')).not.toMatch(/NCF/i);
  });
  it('NCF físico válido (B0100000001)', async () => {
    const errs = await errores(CreateCompraDto, { ...baseCompra, numeroFacturaProveedor: 'B0100000001' });
    expect(errs.join(' ')).not.toMatch(/NCF/i);
  });
  it('formato inválido: rechaza', async () => {
    const errs = await errores(CreateCompraDto, { ...baseCompra, numeroFacturaProveedor: 'FACTURA-001' });
    expect(errs.join(' ')).toMatch(/NCF/i);
  });
});

describe('UpdateNcfProveedorDto.numeroFacturaProveedor', () => {
  it('e-NCF válido', async () => {
    const errs = await errores(UpdateNcfProveedorDto, { numeroFacturaProveedor: 'E320000006814' });
    expect(errs.join(' ')).not.toMatch(/NCF/i);
  });
  it('letra distinta de B/E: rechaza', async () => {
    const errs = await errores(UpdateNcfProveedorDto, { numeroFacturaProveedor: 'A0100000001' });
    expect(errs.join(' ')).toMatch(/NCF/i);
  });
});

describe('CreateGastoDto.comprobante', () => {
  const baseOtros = { fecha: '2026-09-01', categoria: 'otros', descripcion: 'Compra de prueba', monto: 100 };
  const baseGastoMenor = { fecha: '2026-09-01', categoria: 'gasto_menor', descripcion: 'Gasto menor', monto: 100 };

  it('categoría normal + NCF válido: pasa', async () => {
    const errs = await errores(CreateGastoDto, { ...baseOtros, comprobante: 'E320000006814' });
    expect(errs.join(' ')).not.toMatch(/NCF/i);
  });
  it('categoría normal + formato inválido: rechaza', async () => {
    const errs = await errores(CreateGastoDto, { ...baseOtros, comprobante: 'REFERENCIA-XYZ' });
    expect(errs.join(' ')).toMatch(/NCF/i);
  });
  it('GASTO_MENOR (genera su propio E43): el campo es texto libre, NO se valida como NCF', async () => {
    const errs = await errores(CreateGastoDto, { ...baseGastoMenor, comprobante: 'REFERENCIA-XYZ' });
    expect(errs.join(' ')).not.toMatch(/NCF/i);
  });
});

describe('CreateNCCDto.ncfProveedor', () => {
  const base = {
    proveedorId: 1, fecha: '2026-09-27', tipo: 'ajuste_sin_devolucion', motivo: 'error_precio',
    detalles: [{ descripcion: 'Ajuste', cantidad: 1, precioUnitario: 100 }],
  };
  it('vacío: rechaza (obligatorio para el 606)', async () => {
    const errs = await errores(CreateNCCDto, base);
    expect(errs.join(' ')).toMatch(/ncfProveedor/i);
  });
  it('e-NCF/B-NCF válido: pasa', async () => {
    const errs = await errores(CreateNCCDto, { ...base, ncfProveedor: 'B0400000123' });
    expect(errs.join(' ')).not.toMatch(/NCF inválido/i);
  });
  it('formato inválido: rechaza', async () => {
    const errs = await errores(CreateNCCDto, { ...base, ncfProveedor: 'NC-001' });
    expect(errs.join(' ')).toMatch(/NCF inválido/i);
  });
});
