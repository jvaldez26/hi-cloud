import {
  IsString, IsInt, IsPositive, IsEnum, IsArray, IsBoolean,
  IsOptional, IsDateString, IsNumber, ValidateNested, Min, Max,
  MaxLength, ArrayMinSize, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Frecuencia, ModoEmision } from '../entities/factura-recurrente.entity';

/** Tipos de e-CF que puede emitir una factura de venta recurrente. */
export const TIPOS_ECF_VENTA = ['E31', 'E32', 'E41', 'E44', 'E45', 'E46'] as const;

export class DetalleRecurrenteDto {
  @IsOptional() @IsInt() @Type(() => Number)
  productoId?: number;

  @IsString() @MaxLength(500)
  descripcion!: string;

  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() @Type(() => Number)
  cantidad!: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() @Type(() => Number)
  precioUnitario!: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @Type(() => Number)
  porcentajeIva?: number;
}

export class CreateRecurrenteDto {
  @IsString() @MaxLength(200)
  nombre!: string;

  @IsInt() @IsPositive() @Type(() => Number)
  clienteId!: number;

  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleRecurrenteDto)
  detalles!: DetalleRecurrenteDto[];

  @IsEnum(Frecuencia)
  frecuencia!: Frecuencia;

  /**
   * Día del mes, 1 a 31. Obligatorio en mensual y anual.
   * 31 = último día del mes, no "sáltate los meses de 30".
   */
  @IsOptional() @IsInt() @Min(1) @Max(31) @Type(() => Number)
  diaMes?: number;

  /** 1=lunes … 7=domingo. Obligatorio en semanal. */
  @IsOptional() @IsInt() @Min(1) @Max(7) @Type(() => Number)
  diaSemana?: number;

  @IsDateString()
  fechaInicio!: string;

  @IsOptional() @IsDateString()
  fechaFin?: string;

  // ── Qué emite ─────────────────────────────────────────────────────────────

  @IsOptional() @IsEnum(ModoEmision)
  modoEmision?: ModoEmision;

  @IsOptional() @IsIn(TIPOS_ECF_VENTA as unknown as string[])
  tipoEcf?: string;

  // ── Cómo se paga ──────────────────────────────────────────────────────────

  /** Código DGII: 1=Efectivo 2=Cheque/Transferencia 3=Tarjeta 4=Crédito. */
  @IsOptional() @IsInt() @Min(1) @Max(6) @Type(() => Number)
  formaPago?: number;

  @IsOptional() @IsInt() @Min(0) @Max(365) @Type(() => Number)
  diasCredito?: number;

  // ── Avisos ────────────────────────────────────────────────────────────────

  @IsOptional() @IsBoolean() @Type(() => Boolean)
  emailCliente?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(30) @Type(() => Number)
  avisoPrevioDias?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  notas?: string;
}

/**
 * Editar una plantilla. Todo opcional; lo que no venga se queda como está.
 *
 * Sin esto la única forma de corregir una plantilla era borrarla y rehacerla —
 * y con e-CF de por medio eso puede terminar en dos comprobantes el mismo mes.
 */
export class UpdateRecurrenteDto {
  @IsOptional() @IsString() @MaxLength(200)
  nombre?: string;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  clienteId?: number;

  @IsOptional() @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleRecurrenteDto)
  detalles?: DetalleRecurrenteDto[];

  @IsOptional() @IsEnum(Frecuencia)
  frecuencia?: Frecuencia;

  @IsOptional() @IsInt() @Min(1) @Max(31) @Type(() => Number)
  diaMes?: number;

  @IsOptional() @IsInt() @Min(1) @Max(7) @Type(() => Number)
  diaSemana?: number;

  @IsOptional() @IsDateString()
  fechaInicio?: string;

  /** Cadena vacía = quitar la fecha de fin. */
  @IsOptional() @IsString()
  fechaFin?: string;

  @IsOptional() @IsEnum(ModoEmision)
  modoEmision?: ModoEmision;

  @IsOptional() @IsIn(TIPOS_ECF_VENTA as unknown as string[])
  tipoEcf?: string;

  @IsOptional() @IsInt() @Min(1) @Max(6) @Type(() => Number)
  formaPago?: number;

  @IsOptional() @IsInt() @Min(0) @Max(365) @Type(() => Number)
  diasCredito?: number;

  @IsOptional() @IsBoolean() @Type(() => Boolean)
  emailCliente?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(30) @Type(() => Number)
  avisoPrevioDias?: number;

  @IsOptional() @IsBoolean() @Type(() => Boolean)
  activa?: boolean;

  @IsOptional() @IsString() @MaxLength(2000)
  notas?: string;
}
