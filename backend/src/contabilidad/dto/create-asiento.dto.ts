import {
  IsString, IsNotEmpty, IsDateString, IsArray,
  ValidateNested, ArrayMinSize, IsNumber, Min,
  IsOptional, IsInt, IsPositive, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAsientoLineaDto {
  @IsInt() @IsPositive()
  cuentaContableId: number;

  @IsString() @IsNotEmpty() @MaxLength(200)
  descripcion: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  debe: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  haber: number;
}

export class CreateAsientoDto {
  @IsDateString()
  fecha: string;

  @IsString() @IsNotEmpty() @MaxLength(300)
  descripcion: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateAsientoLineaDto)
  lineas: CreateAsientoLineaDto[];

  @IsOptional() @IsString() @MaxLength(50)
  referenciaFolio?: string;
}
