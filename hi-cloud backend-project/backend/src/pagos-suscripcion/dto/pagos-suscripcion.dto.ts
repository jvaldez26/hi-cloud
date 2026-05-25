import {
  IsEnum, IsNotEmpty, IsNumber, IsOptional,
  IsString, MaxLength, IsDateString, Min,
} from 'class-validator';
import { TipoPago } from '../entities/pago-suscripcion.entity';

// ── Registrar pago (super admin) ──────────────────────────────────────────────
export class RegistrarPagoDto {
  @IsEnum(TipoPago)
  tipo: TipoPago;

  @IsString() @IsNotEmpty() @MaxLength(500)
  concepto: string;

  @IsNumber() @Min(0.01)
  montoUsd: number;

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

// ── Cargo adicional ───────────────────────────────────────────────────────────
export class AgregarCargoDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  concepto: string;

  @IsNumber() @Min(0.01)
  montoUsd: number;

  @IsOptional() @IsString()
  notas?: string;
}

// ── Crédito / descuento ───────────────────────────────────────────────────────
export class AplicarCreditoDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  concepto: string;

  @IsNumber() @Min(0.01)
  montoUsd: number;

  @IsOptional() @IsString()
  notas?: string;
}

// ── Subir comprobante de transferencia ────────────────────────────────────────
export class SubirComprobanteDto {
  @IsNumber() @Min(0.01)
  montoUsd: number;

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
