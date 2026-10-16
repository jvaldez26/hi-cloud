import {
  IsInt, IsPositive, IsNumber, IsDateString,
  IsString, IsNotEmpty, IsOptional, MaxLength, MinLength,
} from 'class-validator';

export class RegistrarDepositoDto {
  @IsInt() @IsPositive()
  cuentaBancariaId: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  monto: number;

  @IsDateString()
  fecha: string;

  @IsString() @IsNotEmpty() @MaxLength(300)
  descripcion: string;

  @IsOptional() @IsString() @MaxLength(50)
  referencia?: string;

  /** Selector de cuenta contable — contrapartida del movimiento. Sin default fijo: el motor usa Otros Ingresos/Otros Gastos configurados. */
  @IsOptional() @IsString()
  cuentaContrapartida?: string;
}

export class RegistrarRetiroDto extends RegistrarDepositoDto {}

/**
 * Ajuste manual de saldo (ver docs/deuda-tecnica-bancos-tesoreria.md,
 * incidente 2026-10-15 empresa 53): la ÚNICA forma de que cambie el saldo
 * de una cuenta fuera de un depósito/retiro/transferencia normal. A
 * diferencia de esos, pide `motivo` obligatorio — es una corrección, no una
 * operación del día a día, y debe quedar clara la razón en el historial.
 */
export class AjustarSaldoDto {
  @IsInt() @IsPositive()
  cuentaBancariaId: number;

  /** Positivo aumenta el saldo, negativo lo disminuye. Nunca 0 — validado en el servicio. */
  @IsNumber({ maxDecimalPlaces: 2 })
  monto: number;

  @IsDateString()
  fecha: string;

  @IsString() @IsNotEmpty() @MinLength(5) @MaxLength(300)
  motivo: string;
}

export class RegistrarTransferenciaDto {
  @IsInt() @IsPositive()
  cuentaOrigenId: number;

  @IsInt() @IsPositive()
  cuentaDestinoId: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  monto: number;

  @IsDateString()
  fecha: string;

  @IsString() @IsNotEmpty() @MaxLength(300)
  descripcion: string;

  @IsOptional() @IsString() @MaxLength(50)
  referencia?: string;
}
