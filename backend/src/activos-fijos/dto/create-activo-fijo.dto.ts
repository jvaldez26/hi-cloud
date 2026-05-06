import {
  IsString, IsNotEmpty, IsInt, IsPositive, IsNumber,
  Min, IsDateString, IsOptional, MaxLength,
} from 'class-validator';

export class CreateActivoFijoDto {
  @IsString() @IsNotEmpty() @MaxLength(30)
  codigo: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  descripcion: string;

  @IsInt() @IsPositive()
  categoriaId: number;

  @IsDateString()
  fechaAdquisicion: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  costoAdquisicion: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorResidual?: number;

  @IsOptional() @IsInt() @Min(1)
  vidaUtilAnios?: number;

  @IsOptional() @IsString() @MaxLength(100)
  ubicacion?: string;

  @IsOptional() @IsString() @MaxLength(100)
  proveedor?: string;

  @IsOptional() @IsString() @MaxLength(50)
  numeroSerie?: string;

  @IsOptional() @IsString()
  notas?: string;
}
