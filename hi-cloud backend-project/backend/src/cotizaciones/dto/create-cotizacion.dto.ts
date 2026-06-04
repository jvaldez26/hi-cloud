import {
  IsInt, IsPositive, IsDateString, IsOptional,
  IsString, IsArray, ValidateNested, ArrayMinSize,
  IsNumber, Min, Max, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCotizacionDetalleDto {
  @IsOptional() @IsInt() @IsPositive()
  productoId?: number;

  @IsString() @MaxLength(200)
  descripcion: string;

  @IsInt() @IsPositive()
  @Type(() => Number)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  precioUnitario: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeIva?: number;
}

export class CreateCotizacionDto {
  @IsInt() @IsPositive()
  clienteId: number;

  @IsDateString()
  fecha: string;

  @IsOptional() @IsInt() @Min(1)
  validezDias?: number;

  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCotizacionDetalleDto)
  detalles: CreateCotizacionDetalleDto[];

  @IsOptional() @IsString() @MaxLength(200)
  condicionesPago?: string;

  @IsOptional() @IsString()
  notas?: string;

  @IsOptional() @IsInt() @IsPositive()
  vendedorId?: number;

  @IsOptional() @IsString()
  nombreVendedor?: string;

  @IsOptional() @IsInt() @IsPositive()
  sucursalId?: number;
}
