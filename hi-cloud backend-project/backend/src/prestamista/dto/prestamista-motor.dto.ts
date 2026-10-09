/**
 * Motor v2 (Etapa 2, Fase 2B) — DTOs de la configuración del motor
 * financiero (ver docs/prestamista/motor-financiero.md), usados por
 * Productos de Préstamo, el ajuste de Solicitudes y el Simulador.
 */
import {
  IsIn, IsInt, IsNumber, IsOptional, IsString, IsNotEmpty, IsBoolean,
  MaxLength, Min, ValidateNested, IsArray, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

const FRECUENCIAS = ['diaria', 'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'unico', 'personalizado'];
const METODOS = ['frances', 'aleman', 'americano', 'flat', 'solo_interes_luego_amortiza', 'personalizado'];

export class FrecuenciaDiariaConfigDto {
  @IsBoolean() excluirDomingos!: boolean;
  @IsBoolean() excluirFeriados!: boolean;
}

export class FrecuenciaQuincenalConfigDto {
  @IsIn(['dias_fijos', 'cada_15_dias']) modo!: 'dias_fijos' | 'cada_15_dias';
}

export class TasaConfigDto {
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Type(() => Number)
  valor!: number;

  @IsIn(['diaria', 'semanal', 'quincenal', 'mensual', 'anual'])
  periodoExpresado!: 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'anual';

  @IsIn(['nominal', 'efectiva'])
  tipo!: 'nominal' | 'efectiva';

  @IsIn([360, 365]) @Type(() => Number)
  baseDias!: 360 | 365;
}

export class GraciaConfigDto {
  @IsIn(['capital', 'total']) tipo!: 'capital' | 'total';
  @IsInt() @Min(1) @Type(() => Number) periodos!: number;
  @IsOptional() @IsIn(['prorratea', 'capitaliza', 'primera_cuota'])
  tratamientoInteresGracia?: 'prorratea' | 'capitaliza' | 'primera_cuota';
}

export class TopeMoraDto {
  @IsIn(['monto', 'porcentaje_saldo']) tipo!: 'monto' | 'porcentaje_saldo';
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) valor!: number;
}

export class ConfigFiscalConceptoDto {
  @IsOptional() @IsBoolean() generaComprobante?: boolean | null;
  @IsOptional() @IsString() @MaxLength(10) tipoEcf?: string | null;
  // 0/16/18 o 'exento' — sin validación estricta de tipo a propósito: en
  // Fase 2B todo esto nace en null ("Pendiente de configurar"), el usuario
  // lo completa producto por producto cuando decida el tratamiento fiscal.
  @IsOptional() tratamientoItbis?: number | 'exento' | null;
}

export class MoraConfigDto {
  @IsIn(['capital_vencido', 'cuota_vencida', 'monto_fijo']) base!: 'capital_vencido' | 'cuota_vencida' | 'monto_fijo';
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) tasaOMonto!: number;
  @IsOptional() @IsIn(['dia', 'cuota']) periodoMontoFijo?: 'dia' | 'cuota';
  @IsOptional() @ValidateNested() @Type(() => TopeMoraDto) topeMora?: TopeMoraDto;
  @IsIn([360, 365]) @Type(() => Number) baseDiasMora!: 360 | 365;
}

export class CargoConfigDto {
  @IsString() @IsNotEmpty() @MaxLength(100) concepto!: string;
  @IsIn(['fijo', 'porcentaje']) tipo!: 'fijo' | 'porcentaje';
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) monto!: number;
  @IsIn(['desembolso', 'por_cuota', 'unico_diferido']) momento!: 'desembolso' | 'por_cuota' | 'unico_diferido';
  @IsOptional() @IsIn(['descontado', 'financiado', 'aparte']) tratamientoDesembolso?: 'descontado' | 'financiado' | 'aparte';
  @IsOptional() @IsIn(['primera_cuota', 'ultima_cuota', 'prorrateado']) momentoUnicoDiferido?: 'primera_cuota' | 'ultima_cuota' | 'prorrateado';
  @IsOptional() @ValidateNested() @Type(() => ConfigFiscalConceptoDto) fiscal?: ConfigFiscalConceptoDto;
}

/** Configuración completa del motor — vive en pr_productos_prestamo.motorConfig y, ya resuelta, en pr_prestamos.motorConfig. */
export class MotorConfigDto {
  @IsIn(FRECUENCIAS) frecuencia!: string;
  @IsOptional() @ValidateNested() @Type(() => FrecuenciaDiariaConfigDto) frecuenciaDiaria?: FrecuenciaDiariaConfigDto;
  @IsOptional() @ValidateNested() @Type(() => FrecuenciaQuincenalConfigDto) frecuenciaQuincenal?: FrecuenciaQuincenalConfigDto;
  @ValidateNested() @Type(() => TasaConfigDto) tasa!: TasaConfigDto;
  @IsIn(METODOS) metodo!: string;
  @IsOptional() @IsIn(['frances', 'aleman']) metodoPosteriorGracia?: 'frances' | 'aleman';
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) periodosSoloInteres?: number;
  @IsOptional() @ValidateNested() @Type(() => GraciaConfigDto) gracia?: GraciaConfigDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CargoConfigDto) cargos?: CargoConfigDto[];
  @IsOptional() @ValidateNested() @Type(() => MoraConfigDto) mora?: MoraConfigDto;
  @IsOptional() fiscal?: Record<string, ConfigFiscalConceptoDto>;
  @IsOptional() @IsBoolean() permiteAjusteSolicitud?: boolean;
}

export class CrearFeriadoDto {
  @IsInt() @Min(2000) @Type(() => Number) anio!: number;
  @IsDateString() fecha!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
}

export class ActualizarFeriadoDto {
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsString() @MaxLength(200) nombre?: string;
  @IsOptional() @IsBoolean() confirmado?: boolean;
}

/** Vista previa de tasa (tasaEquivalentePorPeriodo / tasaAnualNominal / TEA) mientras se edita un producto. */
export class VistaTasaDto {
  @ValidateNested() @Type(() => TasaConfigDto) tasa!: TasaConfigDto;
  @IsIn(FRECUENCIAS) frecuencia!: string;
}
