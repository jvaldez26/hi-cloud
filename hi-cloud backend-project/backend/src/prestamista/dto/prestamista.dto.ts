/**
 * DTOs del módulo Prestamista.
 *
 * El módulo entero recibía `@Body() body: any` en sus 17 endpoints, sin una sola
 * validación: entraban montos negativos, cero, texto donde iban números y campos
 * de más. En un módulo que desembolsa y cobra dinero eso es la raíz de varios
 * defectos (un pago de monto 0 creaba un recibo vacío; un monto negativo restaba
 * saldo).
 *
 * El ValidationPipe global ya está en modo whitelist + forbidNonWhitelisted, así
 * que declarar el DTO además descarta cualquier campo no listado aquí.
 *
 * Los importes son DECIMAL en Postgres y llegan como string: por eso todos los
 * numéricos usan @Type(() => Number).
 */
import {
  IsInt, IsPositive, IsNumber, IsOptional, IsString, IsNotEmpty,
  IsDateString, MaxLength, Min, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Monto de dinero: > 0 y con dos decimales como máximo. */
const MONTO = { maxDecimalPlaces: 2 } as const;

export class RegistrarPagoDto {
  @IsInt() @IsPositive() @Type(() => Number)
  prestamoId!: number;

  /** M3: un pago de 0 o negativo no es un pago. */
  @IsNumber(MONTO, { message: 'El monto pagado debe ser un número con hasta 2 decimales' })
  @IsPositive({ message: 'El monto pagado debe ser mayor que cero' })
  @Type(() => Number)
  montoPagado!: number;

  @IsOptional() @IsString() @MaxLength(50)
  metodoPago?: string;

  @IsOptional() @IsString() @MaxLength(100)
  referencia?: string;

  @IsOptional() @IsString() @MaxLength(200)
  cobradorNombre?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class CrearSolicitudDto {
  @IsInt() @IsPositive() @Type(() => Number)
  deudorId!: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  productoId?: number;

  @IsNumber(MONTO) @IsPositive({ message: 'El monto solicitado debe ser mayor que cero' })
  @Type(() => Number)
  montoSolicitado!: number;

  @IsInt() @Min(1, { message: 'El plazo debe ser de al menos 1 mes' }) @Type(() => Number)
  plazoMeses!: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  @IsOptional() @IsString() @MaxLength(500)
  proposito?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class DecidirSolicitudDto {
  @IsIn(['aprobada', 'rechazada'], { message: "La decisión debe ser 'aprobada' o 'rechazada'" })
  decision!: 'aprobada' | 'rechazada';

  @IsOptional() @IsString() @MaxLength(500)
  motivo?: string;

  @IsOptional() @IsNumber(MONTO) @IsPositive() @Type(() => Number)
  montoAprobado?: number;
}

export class CrearPrestamoDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  solicitudId?: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  deudorId?: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  productoId?: number;

  @IsOptional() @IsNumber(MONTO) @IsPositive() @Type(() => Number)
  montoPrincipal?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMeses?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  porcentajeMora?: number;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  diasGracia?: number;

  @IsOptional() @IsDateString({}, { message: 'La fecha de desembolso debe ser una fecha válida' })
  fechaDesembolso?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class RefinanciarDto {
  @IsInt() @IsPositive() @Type(() => Number)
  prestamoOriginalId!: number;

  /** Si se omite, el servicio lo calcula desde los saldos menos lo condonado. */
  @IsOptional() @IsNumber(MONTO) @IsPositive() @Type(() => Number)
  montoNuevo?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMeses?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  /** Condonaciones: nunca negativas (restarían deuda al revés). */
  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  moraCondonada?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  interesCondonado?: number;

  @IsOptional() @IsString() @MaxLength(500)
  motivo?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class CancelarPrestamoDto {
  @IsString() @IsNotEmpty({ message: 'Indica el motivo de la cancelación' })
  @MaxLength(500)
  motivo!: string;
}
