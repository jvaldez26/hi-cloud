import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { TipoCuentaBancaria, Moneda } from '../entities/cuenta-bancaria.entity';

/**
 * A propósito NO incluye `saldo` ni `saldoInicial`: el balance de una cuenta
 * solo debe cambiar por un movimiento (registrarDeposito/registrarRetiro/
 * registrarTransferencia — todos quedan en `movimientos_bancarios` con
 * saldoAnterior/saldoNuevo/origen/usuario), nunca por un PATCH directo a la
 * cuenta.
 *
 * Antes este endpoint recibía `@Body() dto: Partial<CreateCuentaBancariaDto>`
 * inline — TypeScript borra la info de tipo de un `Partial<...>` genérico en
 * tiempo de ejecución (queda como `Object`), así que el ValidationPipe
 * global (whitelist+forbidNonWhitelisted) lo trataba como un tipo nativo "no
 * validable" y dejaba pasar CUALQUIER campo del body tal cual, sin
 * whitelist, directo a `cuentaRepository.update()`. Así pudo quedar un
 * `saldo` puesto a mano, sin ningún movimiento ni rastro de auditoría
 * (hallazgo 2026-10-15, empresa 72 — ver docs/deuda-tecnica-bancos-tesoreria.md).
 * Usar una clase de verdad (esta) hace que el ValidationPipe SÍ corra, y
 * como `saldo` no está aquí, `forbidNonWhitelisted` lo rechaza con 400 en
 * vez de guardarlo en silencio.
 */
export class UpdateCuentaBancariaDto {
  @IsOptional() @IsString() @MaxLength(100)
  banco?: string;

  @IsOptional() @IsString() @MaxLength(30)
  numeroCuenta?: string;

  @IsOptional() @IsEnum(TipoCuentaBancaria)
  tipoCuenta?: TipoCuentaBancaria;

  @IsOptional() @IsEnum(Moneda)
  moneda?: Moneda;

  @IsOptional() @IsString() @MaxLength(200)
  descripcion?: string;
}
