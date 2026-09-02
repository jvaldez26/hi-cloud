import {
  IsInt, IsPositive, IsDateString, IsOptional,
  IsString, IsArray, ValidateNested, ArrayMinSize,
  IsNumber, Min, Max, MaxLength, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCotizacionDetalleDto {
  @IsOptional() @IsInt() @IsPositive()
  productoId?: number;

  @IsString() @MaxLength(200)
  descripcion: string;

  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive()
  @Type(() => Number)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive()
  precioUnitario: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeIva?: number;

  // ── Descuento por línea — mismas reglas que CreateFacturaDto ──────────────
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  descuentoPct?: number;

  /** 4 decimales: el importe sale de dividir entre (1 + ITBIS) */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  descuentoMonto?: number;

  /** Presente ⇒ convención B (POS): precioUnitario ya viene neto */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive()
  precioOriginal?: number;
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

  // ── Descuento general — mismo contrato que CreateFacturaDto ───────────────
  @IsOptional() @IsIn(['monto', 'porcentaje'])
  descuentoGeneralTipo?: string;

  /** Importe en BASE imponible, o el porcentaje. 4 decimales por la división. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  descuentoGeneralValor?: number;

  /** Importe pactado c/ITBIS — solo se imprime, no entra en el cálculo. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  descuentoGeneralFinal?: number;
}
