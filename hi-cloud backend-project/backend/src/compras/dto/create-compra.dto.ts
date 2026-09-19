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

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Min(0.0001)
  @Type(() => Number)
  cantidad: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Type(() => Number)
  cantidadBonificada?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioUnitario: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeItbis?: number;

  /**
   * Descuento POR LÍNEA — se captura como % o como monto (el frontend
   * enlaza los dos inputs); lo que persiste y decide todo cálculo es
   * SIEMPRE descuentoMonto. Que no sea negativo ni supere el importe bruto
   * de la línea (precioUnitario × cantidad) se valida en el service —
   * ahí es donde se conoce ese importe.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  descuentoPct?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Type(() => Number)
  descuentoMonto?: number;
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

  // Clasificación DGII 606 — código de tipo de bien/servicio (01-11) y forma
  // de pago (01-07). Sin default: si el caller no los manda, la columna
  // queda NULL (nunca se pisa con un valor inventado) — el 606 los muestra
  // con COALESCE(...,'09')/COALESCE(...,'04') solo al exportar, y la
  // pantalla de validación usa el NULL real para saber qué compra nadie
  // revisó nunca. Ver declaraciones.service.ts / CompraFormInner.tsx.
  @IsOptional() @IsString()
  tipoBienes?: string;

  @IsOptional() @IsString()
  formaPago?: string;

  /**
   * Selector de cuenta contable — la misma compra puede ser gasto, activo
   * fijo o inventario. Sin default: si no se manda, el motor usa Inventario
   * (el comportamiento de siempre). Ver CuentaContableSelector.tsx.
   */
  @IsOptional() @IsString()
  cuentaDestino?: string;

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

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  sucursalId?: number;

  @IsOptional() @IsBoolean()
  retieneItbis?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @Type(() => Number)
  porcentajeRetencionItbis?: number;

  @IsOptional() @IsBoolean()
  retieneIsr?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @Type(() => Number)
  porcentajeRetencionIsr?: number;
}
