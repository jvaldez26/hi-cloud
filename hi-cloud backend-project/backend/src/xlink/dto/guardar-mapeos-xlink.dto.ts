import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class NuevoProductoXlinkDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  nombre!: string;

  @IsOptional() @IsString() @MaxLength(20)
  unidadMedida?: string;

  @IsOptional() @IsNumber() @Min(0)
  porcentajeIva?: number;
}

export class MapeoXlinkDto {
  @IsIn(['producto', 'unidad', 'impuesto', 'termino_pago', 'retencion'])
  tipo!: 'producto' | 'unidad' | 'impuesto' | 'termino_pago' | 'retencion';

  @IsString() @IsNotEmpty()
  valorExterno!: string;

  /** Usar un producto/valor interno YA existente. */
  @IsOptional() @IsInt() @IsPositive()
  valorInternoId?: number;

  /** O crear uno al vuelo (solo tipo 'producto') — se guarda el mapeo con el id resultante. */
  @IsOptional() @ValidateNested() @Type(() => NuevoProductoXlinkDto)
  crearProducto?: NuevoProductoXlinkDto;
}

export class GuardarMapeosXlinkDto {
  @IsUUID()
  contraparteXlinkId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MapeoXlinkDto)
  mapeos!: MapeoXlinkDto[];
}
