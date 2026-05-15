import {
  IsInt, IsPositive, IsString, IsNotEmpty, IsEnum,
  IsArray, ValidateNested, ArrayMinSize,
  IsNumber, IsOptional, IsDateString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoDevolucion } from '../entities/devolucion.entity';

export class CreateDevolucionDetalleDto {
  @IsOptional() @IsInt() @IsPositive()
  productoId?: number;

  @IsString() @MaxLength(2000) @IsNotEmpty()
  descripcion: string;

  @IsInt() @IsPositive()
  @Type(() => Number)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  precioUnitario: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 })
  porcentajeIva?: number;
}

export class CreateDevolucionDto {
  @IsInt() @IsPositive()
  facturaId: number;

  @IsDateString()
  fecha: string;

  @IsEnum(TipoDevolucion)
  tipo: TipoDevolucion;

  @IsString() @MaxLength(2000) @IsNotEmpty()
  motivo: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDevolucionDetalleDto)
  detalles: CreateDevolucionDetalleDto[];
}
