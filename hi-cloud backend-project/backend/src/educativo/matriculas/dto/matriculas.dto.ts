import { IsDefined, IsOptional, IsString, IsInt, IsIn, IsDateString } from 'class-validator';

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

  // becaId/descuentoBeca eliminados — ver ed-matricula.entity.ts. Las becas
  // reales se asignan por separado en /educativo/becas/asignaciones.

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
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
