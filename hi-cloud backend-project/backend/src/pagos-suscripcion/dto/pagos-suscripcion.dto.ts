import {
  IsEnum, IsNotEmpty, IsNumber, IsOptional,
  IsString, MaxLength, IsDateString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoPago } from '../entities/pago-suscripcion.entity';

// ── Registrar pago (super admin) ──────────────────────────────────────────────
export class RegistrarPagoDto {
  @IsEnum(TipoPago)
  tipo: TipoPago;

  @IsString() @IsNotEmpty() @MaxLength(500)
  concepto: string;

  @Type(() => Number) @IsNumber() @Min(0.01)
  monto: number;

  @IsOptional() @IsString()
  referencia?: string;

  @IsOptional() @IsString()
  notas?: string;

  @IsOptional() @IsDateString()
  periodoInicio?: string;

  @IsOptional() @IsDateString()
  periodoFin?: string;
}

// ── Confirmar / rechazar transferencia ────────────────────────────────────────
export class ConfirmarPagoDto {
  @IsOptional() @IsString()
  notas?: string;
}

export class RechazarPagoDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  motivoRechazo: string;
}

// ── Cancelar suscripción ───────────────────────────────────────────────────────
export class CancelarSuscripcionDto {
  /**
   * Obligatorio: cancelar detiene el devengo del cargo automático de
   * renovación, así que tiene que quedar por qué — igual que un cierre de
   * caja anulado. Quién y cuándo NO viajan aquí: salen del CLS en el
   * controller (`@GetUser`), nunca del body.
   */
  @IsString() @IsNotEmpty() @MaxLength(500)
  motivo: string;
}

// ── Cargo adicional ───────────────────────────────────────────────────────────
export class AgregarCargoDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  concepto: string;

  @Type(() => Number) @IsNumber() @Min(0.01)
  monto: number;

  @IsOptional() @IsString()
  notas?: string;
}

// ── Crédito / descuento ───────────────────────────────────────────────────────
export class AplicarCreditoDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  concepto: string;

  @Type(() => Number) @IsNumber() @Min(0.01)
  monto: number;

  @IsOptional() @IsString()
  notas?: string;
}

// ── Subir comprobante de transferencia ────────────────────────────────────────
export class SubirComprobanteDto {
  // multipart/form-data envía todo como string → @Type convierte antes de validar
  @Type(() => Number) @IsNumber() @Min(0.01)
  monto: number;

  @IsOptional() @IsString()
  referencia?: string;

  @IsOptional() @IsString()
  banco?: string;

  @IsOptional() @IsString()
  notas?: string;
}

// ── Configuración bancaria ────────────────────────────────────────────────────
export class UpdateConfiguracionBancariaDto {
  @IsString() @IsNotEmpty() @MaxLength(255)
  banco: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  numeroCuenta: string;

  @IsOptional() @IsString() @MaxLength(20)
  tipoCuenta?: string;

  @IsString() @IsNotEmpty() @MaxLength(255)
  titular: string;

  @IsOptional() @IsString() @MaxLength(20)
  rnc?: string;
}
