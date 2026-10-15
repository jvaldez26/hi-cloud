/**
 * UpdateCuentaBancariaDto — cierra el hueco de auditoría que dejó
 * `@Body() dto: Partial<CreateCuentaBancariaDto>` (ver update-cuenta-bancaria.dto.ts):
 * TypeScript borra la info de tipo de un `Partial<...>` inline en runtime
 * (queda como `Object`), así que el ValidationPipe global
 * (whitelist+forbidNonWhitelisted) lo trataba como tipo nativo no validable
 * y dejaba pasar CUALQUIER campo del body sin whitelist — incluido `saldo`,
 * que no tiene ningún movimiento ni rastro de auditoría detrás (hallazgo
 * 2026-10-15, empresa 72 — ver docs/deuda-tecnica-bancos-tesoreria.md).
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateCuentaBancariaDto } from './update-cuenta-bancaria.dto';

const OPCIONES_PIPE = { whitelist: true, forbidNonWhitelisted: true };

async function errores(payload: any): Promise<string[]> {
  const inst = plainToInstance(UpdateCuentaBancariaDto, payload, { enableImplicitConversion: true });
  const res  = await validate(inst as object, OPCIONES_PIPE);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('UpdateCuentaBancariaDto', () => {
  it('rechaza `saldo` en el body — el balance solo cambia por un movimiento auditado', async () => {
    const errs = await errores({ descripcion: 'Cambié la descripción', saldo: 153777 });
    expect(errs.join(' ')).toMatch(/saldo/i);
  });

  it('rechaza `saldoInicial` en el body — mismo motivo, no es un campo editable de la cuenta', async () => {
    const errs = await errores({ banco: 'Banreservas', saldoInicial: 999999 });
    expect(errs.join(' ')).toMatch(/saldoInicial/i);
  });

  it('acepta una actualización normal de datos de la cuenta sin montos', async () => {
    const errs = await errores({ banco: 'Banreservas', numeroCuenta: '123', tipoCuenta: 'ahorros', moneda: 'DOP', descripcion: 'Cuenta de nómina' });
    expect(errs).toEqual([]);
  });

  it('todos los campos son opcionales — un PATCH parcial (solo un campo) no revienta', async () => {
    const errs = await errores({ descripcion: 'Solo cambio esto' });
    expect(errs).toEqual([]);
  });
});
