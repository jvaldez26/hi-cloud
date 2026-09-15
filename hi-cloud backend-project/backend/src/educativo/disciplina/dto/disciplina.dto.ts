import {
  IsDefined, IsOptional, IsString, IsInt, IsIn, IsDateString, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const TIPOS_DISCIPLINA = ['leve', 'moderado', 'grave', 'muy_grave'] as const;
export const ESTADOS_DISCIPLINA = ['abierto', 'en_seguimiento', 'cerrado'] as const;

export class CreateDisciplinaDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe ser válida (YYYY-MM-DD)' })
  fecha?: string;

  @IsDefined({ message: 'El tipo de incidente es requerido' })
  @IsIn(TIPOS_DISCIPLINA, { message: 'El tipo debe ser "leve", "moderado", "grave" o "muy_grave"' })
  tipo: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser texto' })
  @MaxLength(100, { message: 'La categoría no puede superar 100 caracteres' })
  @Transform(trim)
  categoria?: string;

  @IsDefined({ message: 'La descripción del incidente es requerida' })
  @IsString({ message: 'La descripción debe ser texto' })
  descripcion: string;

  @IsOptional()
  @IsString({ message: 'La medida tomada debe ser texto' })
  medidaTomada?: string;

  // Quién reporta el incidente (docenteId). Si se omite y el usuario
  // autenticado tiene un ed_docentes vinculado (ed_docentes.usuarioId), el
  // service lo completa solo — ver DisciplinaService.resolverDocenteId().
  @IsOptional()
  @IsInt({ message: 'El docente que reporta debe ser un identificador numérico' })
  reportadoPor?: number;

  @IsOptional()
  @IsString({ message: 'El seguimiento debe ser texto' })
  seguimiento?: string;
}

export class UpdateDisciplinaDto {
  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId?: number;

  @IsOptional()
  @IsIn(TIPOS_DISCIPLINA, { message: 'El tipo debe ser "leve", "moderado", "grave" o "muy_grave"' })
  tipo?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser texto' })
  @MaxLength(100, { message: 'La categoría no puede superar 100 caracteres' })
  @Transform(trim)
  categoria?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  descripcion?: string;

  @IsOptional()
  @IsString({ message: 'La medida tomada debe ser texto' })
  medidaTomada?: string;

  @IsOptional()
  @IsString({ message: 'El seguimiento debe ser texto' })
  seguimiento?: string;

  @IsOptional()
  @IsIn(ESTADOS_DISCIPLINA, { message: 'El estado debe ser "abierto", "en_seguimiento" o "cerrado"' })
  estado?: string;
}

export class FiltrosDisciplinaDto {
  @IsOptional()
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  estudianteId?: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  seccionId?: number;

  @IsOptional()
  @IsIn(TIPOS_DISCIPLINA, { message: 'El tipo debe ser "leve", "moderado", "grave" o "muy_grave"' })
  tipo?: string;

  @IsOptional()
  @IsIn(ESTADOS_DISCIPLINA, { message: 'El estado debe ser "abierto", "en_seguimiento" o "cerrado"' })
  estado?: string;
}

// Marcar "padres notificados" no lleva body — fechaNotificacion siempre es
// NOW() en el momento en que se marca (columna timestamp; no tiene sentido
// aceptar una fecha retroactiva de un evento de comunicación).
