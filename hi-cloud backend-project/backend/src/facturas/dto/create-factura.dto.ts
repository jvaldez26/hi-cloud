import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsDateString,
  IsInt,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFacturaDetalleDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  productoId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  opticaInventarioId?: number;

  @IsOptional()
  @IsString() @MaxLength(2000)
  descripcion?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Type(() => Number)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precioUnitario: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeIva?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descuentoPct?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentoMonto?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precioOriginal?: number;
}

export class CreateFacturaDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  clienteId?: number;

  @IsDateString()
  fecha: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFacturaDetalleDto)
  detalles: CreateFacturaDetalleDto[];

  @IsOptional()
  @IsEnum(['E31','E32','E33','E34','E41','E43','E44','E45','E46','E47'])
  tipoNcf?: string;

  @IsOptional()
  @IsString() @MaxLength(2000)
  notas?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  vendedorId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  sucursalId?: number;

  @IsOptional()
  @IsString()
  nombreVendedor?: string;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsNumber()
  tipoCambio?: number;

  @IsOptional()
  @IsNumber()
  totalOriginal?: number;

  @IsOptional()
  @IsString()
  tipoPago?: string;     // 'CONTADO' | 'CREDITO'

  @IsOptional()
  @IsInt()
  @Min(0)
  diasCredito?: number;

  @IsOptional() @IsBoolean()
  aplicaRetenciones?: boolean;

  @IsOptional() @IsBoolean()
  retieneItbis?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeRetencionItbis?: number;

  @IsOptional() @IsBoolean()
  retieneIsr?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeRetencionIsr?: number;

  // ── Descuento general ─────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  descuentoGeneralTipo?: string;   // 'monto' | 'porcentaje'

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentoGeneralValor?: number;
}
