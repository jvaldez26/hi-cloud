/**
 * CreateFacturaDetalleDto.descripcion — debe rechazar lo que la BD rechaza.
 *
 * BUG REAL (Sentry #7724484308): el DTO validaba @MaxLength(2000) pero
 * factura_detalles.descripcion es varchar(200) — una descripción de, p.ej.,
 * 300 caracteres pasaba la validación y tumbaba POST /api/v1/facturas con
 * un 500 sin manejar ("value too long for type character varying(200)") en
 * vez de un 400 con mensaje claro.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateFacturaDetalleDto } from './create-factura.dto';

const OPCIONES_PIPE = { whitelist: true, forbidNonWhitelisted: true };

async function errores(payload: any): Promise<string[]> {
  const inst = plainToInstance(CreateFacturaDetalleDto, payload, { enableImplicitConversion: true });
  const res  = await validate(inst as object, OPCIONES_PIPE);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}

const base = { cantidad: 1, precioUnitario: 100 };

describe('CreateFacturaDetalleDto.descripcion', () => {
  it('acepta exactamente 200 caracteres — el límite real de la columna', async () => {
    const errs = await errores({ ...base, descripcion: 'x'.repeat(200) });
    expect(errs.join(' ')).not.toMatch(/descripcion/i);
  });

  it('rechaza 201 caracteres — antes pasaba (límite del DTO era 2000) y el INSERT tumbaba con 500', async () => {
    const errs = await errores({ ...base, descripcion: 'x'.repeat(201) });
    expect(errs.join(' ')).toMatch(/descripcion/i);
  });
});
