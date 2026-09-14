import {
  IsDefined, IsOptional, IsString, IsInt, IsIn, IsNumber, IsDateString,
  IsArray, ArrayMinSize, MaxLength, Min, Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpsertPlanDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsDefined({ message: 'El año escolar es requerido' })
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  anioEscolarId: number;

  @IsDefined({ message: 'La colegiatura mensual es requerida' })
  @IsNumber({}, { message: 'La colegiatura mensual debe ser un número' })
  @Min(0, { message: 'La colegiatura mensual no puede ser negativa' })
  montoColegiatura: number;

  @IsOptional()
  @IsNumber({}, { message: 'El monto de matrícula debe ser un número' })
  @Min(0, { message: 'El monto de matrícula no puede ser negativo' })
  montoMatricula?: number;

  @IsOptional()
  @IsInt({ message: 'El día de cobro debe ser un entero' })
  @Min(1, { message: 'El día de cobro debe ser al menos 1' })
  @Max(28, { message: 'El día de cobro no puede superar 28' })
  diaCobro?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El descuento debe ser un número' })
  @Min(0, { message: 'El descuento no puede ser negativo' })
  @Max(100, { message: 'El descuento no puede superar 100' })
  descuento?: number;

  @IsOptional()
  @IsString({ message: 'El nombre del plan debe ser texto' })
  @MaxLength(150, { message: 'El nombre del plan no puede superar 150 caracteres' })
  @Transform(trim)
  nombre?: string;
}

export class GenerarCargosDto {
  @IsDefined({ message: 'Los meses son requeridos' })
  @IsArray({ message: 'Los meses deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos un mes' })
  @IsInt({ each: true, message: 'Cada mes debe ser un entero entre 1 y 12' })
  @Min(1, { each: true, message: 'Cada mes debe ser entre 1 y 12' })
  @Max(12, { each: true, message: 'Cada mes debe ser entre 1 y 12' })
  meses: number[];

  @IsDefined({ message: 'El año es requerido' })
  @IsInt({ message: 'El año debe ser un entero' })
  anio: number;
}

export class GenerarMatriculaDto {
  @IsDefined({ message: 'El año es requerido' })
  @IsInt({ message: 'El año debe ser un entero' })
  anio: number;
}

export class AddCargoDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsOptional()
  @IsInt({ message: 'El plan de pago debe ser un identificador numérico' })
  planPagoId?: number;

  @IsOptional()
  @IsString({ message: 'El tipo debe ser texto' })
  @MaxLength(30, { message: 'El tipo no puede superar 30 caracteres' })
  tipo?: string;

  @IsDefined({ message: 'La descripción es requerida' })
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(200, { message: 'La descripción no puede superar 200 caracteres' })
  @Transform(trim)
  descripcion: string;

  @IsDefined({ message: 'El monto es requerido' })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  monto: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida (YYYY-MM-DD)' })
  fechaVencimiento?: string;

  @IsOptional()
  @IsInt({ message: 'El mes debe ser un entero entre 1 y 12' })
  @Min(1, { message: 'El mes debe ser entre 1 y 12' })
  @Max(12, { message: 'El mes debe ser entre 1 y 12' })
  mes?: number;

  @IsOptional()
  @IsInt({ message: 'El año debe ser un entero' })
  anio?: number;
}

export class UpdateCargoDto {
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(200, { message: 'La descripción no puede superar 200 caracteres' })
  @Transform(trim)
  descripcion?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  monto?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida (YYYY-MM-DD)' })
  fechaVencimiento?: string;

  @IsOptional()
  @IsIn(['pendiente', 'pagado', 'anulado', 'vencido'], { message: 'Estado de cargo inválido' })
  estado?: string;
}

export class RegistrarPagoDto {
  @IsDefined({ message: 'El cargo es requerido' })
  @IsInt({ message: 'El cargo debe ser un identificador numérico' })
  cargoId: number;

  @IsOptional()
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  monto?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe ser una fecha válida (YYYY-MM-DD)' })
  fecha?: string;

  @IsOptional()
  @IsIn(['efectivo', 'transferencia', 'tarjeta', 'cheque'], { message: 'Método de pago inválido' })
  metodoPago?: string;

  @IsOptional()
  @IsString({ message: 'La referencia debe ser texto' })
  @MaxLength(100, { message: 'La referencia no puede superar 100 caracteres' })
  @Transform(trim)
  referencia?: string;

  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser texto' })
  observaciones?: string;
}
