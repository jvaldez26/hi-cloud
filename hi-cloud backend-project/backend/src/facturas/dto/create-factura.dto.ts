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

export class FormaPagoDto {
  @IsInt() @Min(1) @Max(6)
  tipo: number;  // 1=Efectivo 2=Cheque/Transfer 3=Tarjeta 4=Crédito 5=Permuta 6=NC

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  monto: number;

  @IsOptional() @IsString() @MaxLength(200)
  referencia?: string;
}

/**
 * CONTRATO DE PRECIOS POR LÍNEA — dos convenciones:
 *
 * Convención A — Facturas regular (precioOriginal AUSENTE):
 *   precioUnitario  = precio BRUTO antes de descuento
 *   descuentoMonto  = descuento TOTAL de la línea (no por unidad)
 *   subtotal guardado = precioUnitario × cantidad − descuentoMonto
 *
 * Convención B — POS con descuento por ítem (precioOriginal PRESENTE):
 *   precioUnitario  = precio NETO por unidad (ya descontado: precioOriginal − descuentoMonto)
 *   precioOriginal  = precio BRUTO original por unidad (antes del descuento)
 *   descuentoMonto  = descuento POR UNIDAD
 *   subtotal guardado = precioUnitario × cantidad  (el descuento ya está en el precio)
 *   Invariante verificada: precioOriginal − descuentoMonto ≈ precioUnitario (±0.05)
 *
 * El backend detecta la convención por la presencia de precioOriginal y valida
 * la invariante; errores de cuadratura resultan en BadRequest explícito.
 */
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

  /**
   * Convención A: precio bruto (antes de descuento).
   * Convención B (con precioOriginal): precio NETO ya descontado por unidad.
   */
  @IsNumber({ maxDecimalPlaces: 4 })
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

  /**
   * Convención A: descuento TOTAL de la línea.
   * Convención B (con precioOriginal): descuento POR UNIDAD.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentoMonto?: number;

  /**
   * Solo Convención B (POS). Precio bruto original por unidad, antes del descuento.
   * Permite al backend reconstruir la base imponible correcta sin doble-contar el descuento.
   * Invariante: precioOriginal − descuentoMonto ≈ precioUnitario.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
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

  // ── Comprador ─────────────────────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(11)
  rncComprador?: string;

  // ── Orden de Compra ───────────────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(100)
  ordenCompraNumero?: string;

  // ── Formas de pago múltiples ──────────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormaPagoDto)
  formasPago?: FormaPagoDto[];
}
