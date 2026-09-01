import {
  ArrayNotEmpty, IsArray, IsInt, IsNumber, IsOptional, IsPositive,
  IsString, Length, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VincularProductosDto {
  @IsInt() @IsPositive()
  proveedorId!: number;

  @IsArray() @ArrayNotEmpty()
  @IsInt({ each: true })
  productoIds!: number[];

  @IsOptional() @IsString() @MaxLength(100)
  codigoProveedor?: string;

  @IsOptional() @IsNumber() @Min(0)
  precioPactado?: number;

  @IsOptional() @IsString() @Length(3, 3)
  monedaPactada?: string;

  @IsOptional() @IsInt() @Min(0)
  diasEntrega?: number;

  @IsOptional() @IsNumber() @Min(0)
  pedidoMinimo?: number;

  @IsOptional() @IsNumber() @Min(0)
  multiploEmpaque?: number;

  @IsOptional() @IsString()
  notas?: string;
}

export class ActualizarVinculoDto {
  @IsOptional() @IsString() @MaxLength(100)
  codigoProveedor?: string | null;

  @IsOptional() @IsNumber() @Min(0)
  precioPactado?: number | null;

  @IsOptional() @IsString() @Length(3, 3)
  monedaPactada?: string;

  @IsOptional() @IsInt() @Min(0)
  diasEntrega?: number | null;

  @IsOptional() @IsNumber() @Min(0)
  pedidoMinimo?: number | null;

  @IsOptional() @IsNumber() @Min(0)
  multiploEmpaque?: number | null;

  @IsOptional() @IsString()
  notas?: string | null;
}

/**
 * El almacén es opcional en la query pero OBLIGATORIO en la respuesta: si no
 * viene y el JWT tampoco lo trae, el controlador devuelve 400 con un código que
 * la pantalla usa para preguntar cuál. Nunca se cae al stock global.
 */
export class ReposicionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive()
  almacenId?: number;
}
