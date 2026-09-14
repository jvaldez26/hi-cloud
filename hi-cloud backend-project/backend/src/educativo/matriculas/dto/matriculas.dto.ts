import { IsDefined, IsOptional, IsString, IsInt, IsIn, IsNumber, IsDateString, Min, Max } from 'class-validator';

export class CreateMatriculaDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsOptional()
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  anioEscolarId?: number;

  @IsOptional()
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  gradoId?: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de matrícula debe ser una fecha válida (YYYY-MM-DD)' })
  fechaMatricula?: string;

  @IsOptional()
  @IsIn(['activa', 'inactiva', 'retirada', 'graduada'], { message: 'Estado de matrícula inválido' })
  estado?: string;

  @IsOptional()
  @IsInt({ message: 'La beca debe ser un identificador numérico' })
  becaId?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El descuento de beca debe ser un número' })
  @Min(0, { message: 'El descuento de beca no puede ser negativo' })
  @Max(100, { message: 'El descuento de beca no puede superar 100' })
  descuentoBeca?: number;

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}

export class UpdateMatriculaDto {
  @IsOptional()
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  gradoId?: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId?: number;

  @IsOptional()
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  anioEscolarId?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de matrícula debe ser una fecha válida (YYYY-MM-DD)' })
  fechaMatricula?: string;

  @IsOptional()
  @IsIn(['activa', 'inactiva', 'retirada', 'graduada'], { message: 'Estado de matrícula inválido' })
  estado?: string;

  @IsOptional()
  @IsInt({ message: 'La beca debe ser un identificador numérico' })
  becaId?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El descuento de beca debe ser un número' })
  @Min(0, { message: 'El descuento de beca no puede ser negativo' })
  @Max(100, { message: 'El descuento de beca no puede superar 100' })
  descuentoBeca?: number;

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
