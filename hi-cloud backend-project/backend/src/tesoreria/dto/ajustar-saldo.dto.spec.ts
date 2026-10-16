import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AjustarSaldoDto } from './registrar-movimiento.dto';

const OPCIONES_PIPE = { whitelist: true, forbidNonWhitelisted: true };

async function errores(payload: any): Promise<string[]> {
  const inst = plainToInstance(AjustarSaldoDto, payload, { enableImplicitConversion: true });
  const res  = await validate(inst as object, OPCIONES_PIPE);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('AjustarSaldoDto', () => {
  it('exige motivo — un ajuste sin explicación nunca se acepta', async () => {
    const errs = await errores({ cuentaBancariaId: 7, monto: 24000, fecha: '2026-10-15' });
    expect(errs.join(' ')).toMatch(/motivo/i);
  });

  it('rechaza un motivo de menos de 5 caracteres', async () => {
    const errs = await errores({ cuentaBancariaId: 7, monto: 24000, fecha: '2026-10-15', motivo: 'ok' });
    expect(errs.join(' ')).toMatch(/motivo/i);
  });

  it('acepta un ajuste positivo válido', async () => {
    const errs = await errores({ cuentaBancariaId: 7, monto: 24000, fecha: '2026-10-15', motivo: 'Depósito confirmado con el cliente' });
    expect(errs).toEqual([]);
  });

  it('acepta un ajuste negativo válido', async () => {
    const errs = await errores({ cuentaBancariaId: 7, monto: -200, fecha: '2026-10-15', motivo: 'Comisión bancaria no registrada' });
    expect(errs).toEqual([]);
  });
});
