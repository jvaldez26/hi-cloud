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
  IsEnum,
  IsIn,
  IsNotEmpty,
  ValidateIf,
  Min,
  Max,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DestinoItbis } from '../../common/enums/destino-itbis.enum';
import { IsValidNCF } from '../../common/validators/ncf.validator';

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

  // 4 decimales, igual que precioUnitario en facturas (create-factura.dto.ts)
  // — el total de la línea se redondea a 2 al calcularla, pero el precio en
  // sí puede venir con más precisión (p.ej. importaciones con costo en USD
  // convertido). @Type(() => Number) agregado para que un precio mandado
  // como string se convierta en vez de rechazarse — mismo patrón que
  // `cantidad` arriba, que sí lo tenía.
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Type(() => Number)
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

  /**
   * Destino del ITBIS de esta línea — alimenta las casillas 45-51 del Anexo
   * A (anexo-a.service.ts). Sin default aquí a propósito: si no se manda,
   * queda NULL y el motor lo trata como 'gravado' (comportamiento de hoy).
   */
  @IsOptional()
  @IsEnum(DestinoItbis)
  destinoItbis?: DestinoItbis;

  @ValidateIf((o) => o.destinoItbis === DestinoItbis.OTRO)
  @IsString()
  @IsNotEmpty({ message: 'destinoItbisMotivo es obligatorio cuando destinoItbis = "otro".' })
  @MaxLength(300)
  destinoItbisMotivo?: string;
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
  @IsValidNCF()
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

  /**
   * Descuento GENERAL (a nivel de documento completo) — se reparte
   * proporcionalmente entre líneas antes del ITBIS, sobre el subtotal YA neto
   * del descuento de línea. Mismo contrato que facturas/cotizaciones (ver
   * common/calculo/descuento-documento.ts): 'tipo' decide qué rama corre, no
   * hay reconciliación entre ambos.
   */
  @IsOptional() @IsString() @IsIn(['monto', 'porcentaje'])
  descuentoGeneralTipo?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  descuentoGeneralValor?: number;

  /**
   * 'subtotal' (default si se omite) = el valor de arriba se resta del
   * subtotal, ITBIS se recalcula sobre el neto. 'total' = el valor de arriba
   * es cuánto debe bajar el TOTAL final (con ITBIS incluido) — con tasas
   * mixtas se reparte por el peso de cada línea en el total, no en el
   * subtotal (ver descuento-documento.ts).
   */
  @IsOptional() @IsString() @IsIn(['subtotal', 'total'])
  descuentoGeneralAplicarSobre?: string;

  /**
   * Idempotencia (recuperación de borradores). El FRONTEND genera un UUID al
   * abrir el formulario; si la misma clave llega dos veces (reintento tras
   * restaurar un borrador cuyo guardado falló la vez pasada), create()
   * devuelve la compra YA CREADA con esa clave en vez de crear una
   * duplicada. Ver Compra.claveIdempotencia y ComprasService.create().
   */
  @IsOptional()
  @IsString() @MaxLength(36)
  claveIdempotencia?: string;
}
