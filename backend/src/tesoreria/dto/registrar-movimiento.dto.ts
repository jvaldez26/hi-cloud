import {
  IsInt, IsPositive, IsNumber, IsDateString,
  IsString, IsNotEmpty, IsOptional, MaxLength,
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
}

export class RegistrarRetiroDto extends RegistrarDepositoDto {}

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
