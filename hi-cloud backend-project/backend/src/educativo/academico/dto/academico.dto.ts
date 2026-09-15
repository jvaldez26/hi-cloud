import {
  IsDefined, IsOptional, IsString, IsInt, IsIn, IsNumber, IsDateString,
  IsArray, ArrayMinSize, ValidateNested, MaxLength, Min, Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ── Evaluaciones ────────────────────────────────────────────────────────────

export class CreateEvaluacionDto {
  @IsDefined({ message: 'La sección es requerida' })
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId: number;

  @IsDefined({ message: 'La asignatura es requerida' })
  @IsInt({ message: 'La asignatura debe ser un identificador numérico' })
  asignaturaId: number;

  // ed_evaluaciones.periodoId es NOT NULL (ed-evaluacion.entity.ts) — marcarlo
  // opcional aquí dejaba pasar la validación y reventaba después con un 23502
  // crudo de Postgres ("Campo requerido faltante: periodoId" en vivo,
  // 2026-09-14). La UI exige seleccionar un período antes de habilitar
  // "Nueva evaluación" (ver PlanillaNotasPage.tsx).
  @IsDefined({ message: 'El período es requerido' })
  @IsInt({ message: 'El periodo debe ser un identificador numérico' })
  periodoId: number;

  @IsDefined({ message: 'El nombre de la evaluación es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsOptional()
  @IsString({ message: 'El tipo debe ser texto' })
  @MaxLength(50, { message: 'El tipo no puede superar 50 caracteres' })
  tipo?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe ser una fecha válida (YYYY-MM-DD)' })
  fecha?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El puntaje máximo debe ser un número' })
  @Min(0, { message: 'El puntaje máximo no puede ser negativo' })
  puntajeMaximo?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La ponderación debe ser un número' })
  @Min(0, { message: 'La ponderación no puede ser negativa' })
  @Max(100, { message: 'La ponderación no puede superar 100' })
  ponderacion?: number;
}

export class UpdateEvaluacionDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'El tipo debe ser texto' })
  @MaxLength(50, { message: 'El tipo no puede superar 50 caracteres' })
  tipo?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe ser una fecha válida (YYYY-MM-DD)' })
  fecha?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El puntaje máximo debe ser un número' })
  @Min(0, { message: 'El puntaje máximo no puede ser negativo' })
  puntajeMaximo?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La ponderación debe ser un número' })
  @Min(0, { message: 'La ponderación no puede ser negativa' })
  @Max(100, { message: 'La ponderación no puede superar 100' })
  ponderacion?: number;

  @IsOptional()
  @IsIn(['activa', 'anulada'], { message: 'El estado debe ser "activa" o "anulada"' })
  estado?: string;
}

// ── Calificaciones ───────────────────────────────────────────────────────────

export class CalificacionItemDto {
  @IsDefined({ message: 'La evaluación es requerida' })
  @IsInt({ message: 'La evaluación debe ser un identificador numérico' })
  evaluacionId: number;

  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsDefined({ message: 'La nota es requerida' })
  @IsNumber({}, { message: 'La nota debe ser un número' })
  @Min(0, { message: 'La nota no puede ser negativa' })
  nota: number;
}

export class BulkCalificacionesDto {
  @IsDefined({ message: 'Las calificaciones son requeridas' })
  @IsArray({ message: 'Las calificaciones deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe enviar al menos una calificación' })
  @ValidateNested({ each: true })
  @Type(() => CalificacionItemDto)
  items: CalificacionItemDto[];
}

// ── Asistencia ────────────────────────────────────────────────────────────────

export class AsistenciaItemDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsDefined({ message: 'El estado de asistencia es requerido' })
  @IsIn(['presente', 'ausente', 'tardanza', 'justificado'], { message: 'Estado de asistencia inválido' })
  estado: string;

  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser texto' })
  observaciones?: string;
}

export class BulkAsistenciaDto {
  @IsDefined({ message: 'La sección es requerida' })
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId: number;

  @IsDefined({ message: 'La fecha es requerida' })
  @IsDateString({}, { message: 'La fecha debe ser una fecha válida (YYYY-MM-DD)' })
  fecha: string;

  @IsDefined({ message: 'La asistencia es requerida' })
  @IsArray({ message: 'La asistencia debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe enviar al menos un registro de asistencia' })
  @ValidateNested({ each: true })
  @Type(() => AsistenciaItemDto)
  items: AsistenciaItemDto[];
}
