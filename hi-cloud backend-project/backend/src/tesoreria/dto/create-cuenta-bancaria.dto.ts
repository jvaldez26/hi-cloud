import {
  IsString, IsNotEmpty, IsEnum, IsOptional,
  IsNumber, Min, MaxLength,
} from 'class-validator';
import { TipoCuentaBancaria, Moneda } from '../entities/cuenta-bancaria.entity';

export class CreateCuentaBancariaDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  banco: string;

  @IsString() @IsNotEmpty() @MaxLength(30)
  numeroCuenta: string;

  @IsEnum(TipoCuentaBancaria)
  tipoCuenta: TipoCuentaBancaria;

  @IsEnum(Moneda)
  moneda: Moneda;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saldoInicial?: number;

  @IsOptional() @IsString() @MaxLength(200)
  descripcion?: string;
}
