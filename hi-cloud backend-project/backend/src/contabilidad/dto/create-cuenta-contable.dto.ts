import {
  IsString, IsNotEmpty, IsEnum, IsInt, IsBoolean,
  IsOptional, MaxLength, Min, Max,
} from 'class-validator';
import { TipoCuenta, NaturalezaCuenta } from '../entities/cuenta-contable.entity';

export class CreateCuentaContableDto {
  @IsString() @IsNotEmpty() @MaxLength(20)
  codigo: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  nombre: string;

  @IsEnum(TipoCuenta)
  tipo: TipoCuenta;

  @IsEnum(NaturalezaCuenta)
  naturaleza: NaturalezaCuenta;

  @IsInt() @Min(1) @Max(5)
  nivel: number;

  @IsBoolean()
  permiteMovimientos: boolean;

  @IsOptional() @IsInt()
  cuentaPadreId?: number;

  @IsOptional() @IsString()
  descripcion?: string;
}
