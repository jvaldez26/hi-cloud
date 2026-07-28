import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateProductoDto {
  @IsOptional()
  @IsString()
  @IsIn(['producto', 'servicio'])
  tipo?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;  // null = "borrar y auto-generar"
    if (!value || value === 'undefined' || value === 'null' || !String(value).trim()) return undefined;
    return String(value).trim();
  })
  @IsString()
  @MaxLength(30)
  codigo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigoBarras?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString() @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadMedida?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Type(() => Number)
  precio: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Type(() => Number)
  precio2?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Type(() => Number)
  precio3?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  costo?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  porcentajeIva?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  stockMinimo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  claveProductoSat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  claveUnidadSat?: string;

  @IsOptional()
  @IsString()
  imagenUrl?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  almacenId?: number;   // Almacén donde inicializar el stock al crear/actualizar

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  ubicacionId?: number; // Ubicación WMS por defecto dentro del almacén (opcional)

  @IsOptional()
  @IsString()
  @MaxLength(100)
  marca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;

  @IsOptional()
  @IsBoolean()
  esCreacionRapida?: boolean;
}
