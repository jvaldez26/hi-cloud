import {
  IsString, IsNotEmpty, IsIn, IsInt, IsOptional,
  Min, Max, MaxLength, IsArray, ValidateNested, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

const CAMPOS_VALIDOS = ['plu', 'nombre', 'precio', 'iva', 'categoria', 'codigo', 'codigoBarras'] as const;

class ColumnaDto {
  @IsString()
  @IsIn(CAMPOS_VALIDOS)
  campo!: typeof CAMPOS_VALIDOS[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  titulo!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  ancho?: number;
}

export class CreateFormatoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @IsString()
  @IsIn(['CSV', 'TXT', 'XLS'])
  formato!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  separador?: string;

  @IsInt()
  @Min(5)
  @Max(200)
  @Type(() => Number)
  limiteNombre!: number;

  @IsString()
  @IsIn(['UTF-8', 'ISO-8859-1', 'Windows-1252'])
  codificacion!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnaDto)
  columnas!: ColumnaDto[];
}
