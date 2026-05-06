import {
  IsEnum, IsInt, IsString, IsNotEmpty, IsOptional,
  IsArray, ValidateNested, IsNumber, IsPositive,
  Min, Max, MaxLength, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoPresupuesto } from '../entities/presupuesto.entity';

export class CreatePresupuestoLineaDto {
  @IsInt() @Min(1) @Max(12)
  mes: number;

  @IsOptional() @IsString() @MaxLength(100)
  categoria?: string;

  @IsOptional() @IsString() @MaxLength(20)
  cuentaCodigo?: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  montoPresupuestado: number;

  @IsOptional() @IsString()
  notas?: string;
}

export class CreatePresupuestoDto {
  @IsInt() @Min(2020) @Max(2040)
  anio: number;

  @IsString() @IsNotEmpty() @MaxLength(200)
  nombre: string;

  @IsEnum(TipoPresupuesto)
  tipo: TipoPresupuesto;

  @IsOptional() @IsString()
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePresupuestoLineaDto)
  lineas?: CreatePresupuestoLineaDto[];
}
