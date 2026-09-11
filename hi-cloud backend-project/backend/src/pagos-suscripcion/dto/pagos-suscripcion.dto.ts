import {
  IsEnum, IsNotEmpty, IsNumber, IsOptional,
  IsString, MaxLength, IsDateString, Min, IsIn, IsInt, IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoPago } from '../entities/pago-suscripcion.entity';

/** null = imputación automática (cargos → períodos → abono, el orden por defecto). */
export const OVERRIDES_IMPUTACION = ['solo_cargos', 'solo_suscripcion'] as const;
export type OverrideImputacionDto = typeof OVERRIDES_IMPUTACION[number];

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

  /**
   * Override del orden de imputación por defecto (cargos → períodos →
   * abono). 'solo_cargos' ignora los períodos aunque sobre dinero después
   * de liquidar cargos (el resto queda de abono); 'solo_suscripcion'
   * ignora los cargos y aplica todo a períodos, dejándolos intactos.
   */
  @IsOptional() @IsIn(OVERRIDES_IMPUTACION)
  override?: OverrideImputacionDto;
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

  /**
   * Cargo específico contra el que se aplica el crédito — el excedente (si
   * el crédito es mayor que el saldo del cargo) va al abono general. Sin
   * este campo, el crédito completo va al abono general (comportamiento
   * anterior).
   */
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive()
  cargoId?: number;
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
