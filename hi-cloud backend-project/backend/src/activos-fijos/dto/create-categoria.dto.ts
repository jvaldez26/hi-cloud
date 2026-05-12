import {
  IsString, IsNotEmpty, IsEnum, IsInt, IsNumber,
  IsPositive, Min, Max, MaxLength, IsOptional,
} from 'class-validator';
import { MetodoDepreciacion } from '../entities/categoria-activo.entity';

export class CreateCategoriaDto {
  @IsString() @IsNotEmpty() @MaxLength(10)
  codigo: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  nombre: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(100)
  tasaAnual: number;

  @IsEnum(MetodoDepreciacion)
  metodo: MetodoDepreciacion;

  @IsInt() @Min(1)
  vidaUtilAnios: number;

  @IsOptional() @IsString() @MaxLength(200)
  descripcion?: string;

  @IsOptional() @IsString() @MaxLength(20)
  cuentaActivoCodigo?: string;

  @IsOptional() @IsString() @MaxLength(20)
  cuentaDepreciacionCodigo?: string;

  @IsOptional() @IsString() @MaxLength(20)
  cuentaGastoCodigo?: string;
}
