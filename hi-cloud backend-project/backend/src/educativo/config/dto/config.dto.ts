import {
  IsDefined, IsOptional, IsString, IsBoolean, IsNumber, IsInt, IsIn,
  IsDateString, IsArray, MaxLength, Min, Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpsertConfigDto {
  @IsOptional()
  @IsString({ message: 'El nombre del centro debe ser texto' })
  @MaxLength(300, { message: 'El nombre del centro no puede superar 300 caracteres' })
  @Transform(trim)
  nombreCentro?: string;

  @IsOptional()
  @IsString({ message: 'El código MINERD debe ser texto' })
  @MaxLength(100, { message: 'El código MINERD no puede superar 100 caracteres' })
  @Transform(trim)
  codigoMinerd?: string;

  @IsOptional()
  @IsString({ message: 'La regional debe ser texto' })
  @MaxLength(100, { message: 'La regional no puede superar 100 caracteres' })
  @Transform(trim)
  regional?: string;

  @IsOptional()
  @IsString({ message: 'El distrito educativo debe ser texto' })
  @MaxLength(100, { message: 'El distrito educativo no puede superar 100 caracteres' })
  @Transform(trim)
  distritoEducativo?: string;

  @IsOptional()
  @IsNumber({}, { message: 'La escala mínima debe ser un número' })
  escalaMinima?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La escala máxima debe ser un número' })
  escalaMaxima?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La nota mínima para aprobar debe ser un número' })
  notaMinimaAprobar?: number;

  @IsOptional()
  @IsBoolean({ message: 'usaLetras debe ser verdadero o falso' })
  usaLetras?: boolean;

  @IsOptional()
  @IsArray({ message: 'La escala de letras debe ser un arreglo' })
  escalaLetras?: unknown[];

  @IsOptional()
  @IsInt({ message: 'La cantidad de periodos debe ser un entero' })
  @Min(1, { message: 'Debe haber al menos 1 periodo' })
  @Max(12, { message: 'No puede haber más de 12 periodos' })
  cantidadPeriodos?: number;

  @IsOptional()
  @IsString({ message: 'El tipo de periodo debe ser texto' })
  @MaxLength(20, { message: 'El tipo de periodo no puede superar 20 caracteres' })
  @Transform(trim)
  tipoPeriodo?: string;

  @IsOptional()
  @IsString({ message: 'La moneda de colegiatura debe ser texto' })
  @MaxLength(10, { message: 'La moneda no puede superar 10 caracteres' })
  @Transform(trim)
  monedaColegiatura?: string;
}

export class CreateAnioEscolarDto {
  @IsDefined({ message: 'El nombre del año escolar es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(50, { message: 'El nombre no puede superar 50 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsDefined({ message: 'La fecha de inicio es requerida' })
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha válida (YYYY-MM-DD)' })
  fechaInicio: string;

  @IsDefined({ message: 'La fecha de fin es requerida' })
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha válida (YYYY-MM-DD)' })
  fechaFin: string;

  @IsOptional()
  @IsString({ message: 'El estado debe ser texto' })
  @MaxLength(20, { message: 'El estado no puede superar 20 caracteres' })
  estado?: string;

  @IsOptional()
  @IsBoolean({ message: 'esActual debe ser verdadero o falso' })
  esActual?: boolean;
}

export class UpdateAnioEscolarDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(50, { message: 'El nombre no puede superar 50 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha válida (YYYY-MM-DD)' })
  fechaInicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha válida (YYYY-MM-DD)' })
  fechaFin?: string;

  @IsOptional()
  @IsString({ message: 'El estado debe ser texto' })
  @MaxLength(20, { message: 'El estado no puede superar 20 caracteres' })
  estado?: string;

  @IsOptional()
  @IsBoolean({ message: 'esActual debe ser verdadero o falso' })
  esActual?: boolean;
}

export class CreatePeriodoDto {
  @IsDefined({ message: 'El año escolar es requerido' })
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  anioEscolarId: number;

  @IsDefined({ message: 'El nombre del periodo es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(50, { message: 'El nombre no puede superar 50 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsDefined({ message: 'El número de periodo es requerido' })
  @IsInt({ message: 'El número de periodo debe ser un entero' })
  numero: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha válida (YYYY-MM-DD)' })
  fechaInicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha válida (YYYY-MM-DD)' })
  fechaFin?: string;

  @IsOptional()
  @IsNumber({}, { message: 'La ponderación debe ser un número' })
  ponderacion?: number;

  @IsOptional()
  @IsIn(['abierto', 'cerrado'], { message: 'El estado debe ser "abierto" o "cerrado"' })
  estado?: string;
}

export class UpdatePeriodoDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(50, { message: 'El nombre no puede superar 50 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsInt({ message: 'El número de periodo debe ser un entero' })
  numero?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha válida (YYYY-MM-DD)' })
  fechaInicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha válida (YYYY-MM-DD)' })
  fechaFin?: string;

  @IsOptional()
  @IsNumber({}, { message: 'La ponderación debe ser un número' })
  ponderacion?: number;

  @IsOptional()
  @IsIn(['abierto', 'cerrado'], { message: 'El estado debe ser "abierto" o "cerrado"' })
  estado?: string;
}
