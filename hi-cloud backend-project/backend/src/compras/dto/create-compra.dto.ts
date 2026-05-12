import {
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsDateString,
  IsNumber,
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
  @IsString()
  notas?: string;
}
