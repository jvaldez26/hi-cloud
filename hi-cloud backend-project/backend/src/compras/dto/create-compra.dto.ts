import {
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCompraDetalleDto {
  @IsInt()
  @IsPositive()
  productoId: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @IsInt()
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
  porcentajeItbis?: number;
}

export class CreateCompraDto {
  @IsInt()
  @IsPositive()
  proveedorId: number;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroFacturaProveedor?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCompraDetalleDto)
  detalles: CreateCompraDetalleDto[];

  @IsOptional()
  @IsString() @MaxLength(2000)
  notas?: string;

  @IsOptional()
  @IsString()
  tipoPago?: 'contado' | 'credito';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  @Type(() => Number)
  diasCredito?: number;

  @IsOptional()
  @IsString()
  @IsIn(['DOP', 'USD', 'EUR'])
  moneda?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(1)
  @Type(() => Number)
  tipoCambio?: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  almacenId?: number;

  @IsOptional() @IsBoolean()
  retieneItbis?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @Type(() => Number)
  porcentajeRetencionItbis?: number;

  @IsOptional() @IsBoolean()
  retieneIsr?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @Type(() => Number)
  porcentajeRetencionIsr?: number;
}
