import {
  IsDefined, IsOptional, IsString, IsBoolean, IsInt, IsArray, ValidateNested, MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ── Niveles ───────────────────────────────────────────────────────────────

export class CreateNivelDto {
  @IsDefined({ message: 'El nombre del nivel es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsOptional()
  @IsInt({ message: 'El orden debe ser un entero' })
  orden?: number;
}

export class UpdateNivelDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsInt({ message: 'El orden debe ser un entero' })
  orden?: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}

// ── Grados ────────────────────────────────────────────────────────────────

export class CreateGradoDto {
  @IsOptional()
  @IsInt({ message: 'El nivel debe ser un identificador numérico' })
  nivelId?: number;

  @IsDefined({ message: 'El nombre del grado es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsOptional()
  @IsInt({ message: 'El orden debe ser un entero' })
  orden?: number;
}

export class UpdateGradoDto {
  @IsOptional()
  @IsInt({ message: 'El nivel debe ser un identificador numérico' })
  nivelId?: number;

  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsInt({ message: 'El orden debe ser un entero' })
  orden?: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}

export class PensumItemDto {
  @IsDefined({ message: 'La asignatura es requerida' })
  @IsInt({ message: 'La asignatura debe ser un identificador numérico' })
  asignaturaId: number;

  @IsOptional()
  @IsInt({ message: 'Las horas semanales deben ser un entero' })
  horasSemanales?: number;

  @IsOptional()
  @IsInt({ message: 'El orden debe ser un entero' })
  orden?: number;
}

export class SetPensumDto {
  @IsDefined({ message: 'El pensum es requerido' })
  @IsArray({ message: 'El pensum debe ser un arreglo de asignaturas' })
  @ValidateNested({ each: true })
  @Type(() => PensumItemDto)
  asignaturas: PensumItemDto[];
}

// ── Secciones ─────────────────────────────────────────────────────────────

export class CreateSeccionDto {
  @IsDefined({ message: 'El grado es requerido' })
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  gradoId: number;

  @IsOptional()
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  anioEscolarId?: number;

  @IsDefined({ message: 'El nombre de la sección es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(50, { message: 'El nombre no puede superar 50 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsOptional()
  @IsInt({ message: 'La capacidad máxima debe ser un entero' })
  capacidadMaxima?: number;

  @IsOptional()
  @IsString({ message: 'El aula debe ser texto' })
  @MaxLength(50, { message: 'El aula no puede superar 50 caracteres' })
  @Transform(trim)
  aula?: string;

  @IsOptional()
  @IsInt({ message: 'El tutor debe ser un identificador numérico' })
  tutorId?: number;
}

export class UpdateSeccionDto {
  @IsOptional()
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  gradoId?: number;

  @IsOptional()
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  anioEscolarId?: number;

  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(50, { message: 'El nombre no puede superar 50 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsInt({ message: 'La capacidad máxima debe ser un entero' })
  capacidadMaxima?: number;

  @IsOptional()
  @IsString({ message: 'El aula debe ser texto' })
  @MaxLength(50, { message: 'El aula no puede superar 50 caracteres' })
  @Transform(trim)
  aula?: string;

  @IsOptional()
  @IsInt({ message: 'El tutor debe ser un identificador numérico' })
  tutorId?: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}

// ── Asignaturas ───────────────────────────────────────────────────────────

export class CreateAsignaturaDto {
  @IsDefined({ message: 'El nombre de la asignatura es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsOptional()
  @IsString({ message: 'El código debe ser texto' })
  @MaxLength(50, { message: 'El código no puede superar 50 caracteres' })
  @Transform(trim)
  codigo?: string;

  @IsOptional()
  @IsString({ message: 'El área debe ser texto' })
  @MaxLength(100, { message: 'El área no puede superar 100 caracteres' })
  @Transform(trim)
  area?: string;

  @IsOptional()
  @IsBoolean({ message: 'esEvaluable debe ser verdadero o falso' })
  esEvaluable?: boolean;
}

export class UpdateAsignaturaDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'El código debe ser texto' })
  @MaxLength(50, { message: 'El código no puede superar 50 caracteres' })
  @Transform(trim)
  codigo?: string;

  @IsOptional()
  @IsString({ message: 'El área debe ser texto' })
  @MaxLength(100, { message: 'El área no puede superar 100 caracteres' })
  @Transform(trim)
  area?: string;

  @IsOptional()
  @IsBoolean({ message: 'esEvaluable debe ser verdadero o falso' })
  esEvaluable?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}
