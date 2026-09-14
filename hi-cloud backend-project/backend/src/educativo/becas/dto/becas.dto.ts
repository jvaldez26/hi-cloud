import {
  IsDefined, IsOptional, IsString, IsBoolean, IsInt, IsIn, IsNumber,
  IsDateString, MaxLength, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ── Catálogo (ed_becas) ──────────────────────────────────────────────────────

export class CreateBecaDto {
  @IsDefined({ message: 'El nombre de la beca es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsDefined({ message: 'El tipo de beca es requerido' })
  @IsIn(['porcentaje', 'monto_fijo'], { message: 'El tipo debe ser "porcentaje" o "monto_fijo"' })
  tipo: string;

  @IsDefined({ message: 'El valor de la beca es requerido' })
  @IsNumber({}, { message: 'El valor debe ser un número' })
  @Min(0, { message: 'El valor no puede ser negativo' })
  valor: number;

  @IsDefined({ message: 'A qué aplica la beca es requerido' })
  @IsIn(['colegiatura', 'inscripcion', 'ambos'], { message: 'aplicaA debe ser "colegiatura", "inscripcion" o "ambos"' })
  aplicaA: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  descripcion?: string;
}

export class UpdateBecaDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsIn(['porcentaje', 'monto_fijo'], { message: 'El tipo debe ser "porcentaje" o "monto_fijo"' })
  tipo?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El valor debe ser un número' })
  @Min(0, { message: 'El valor no puede ser negativo' })
  valor?: number;

  @IsOptional()
  @IsIn(['colegiatura', 'inscripcion', 'ambos'], { message: 'aplicaA debe ser "colegiatura", "inscripcion" o "ambos"' })
  aplicaA?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  descripcion?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}

// ── Asignación a estudiantes (ed_estudiante_becas) ───────────────────────────

export class AsignarBecaDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsDefined({ message: 'La beca es requerida' })
  @IsInt({ message: 'La beca debe ser un identificador numérico' })
  becaId: number;

  @IsOptional()
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  anioEscolarId?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de asignación debe ser una fecha válida (YYYY-MM-DD)' })
  fechaAsignacion?: string;

  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto' })
  motivo?: string;

  @IsOptional()
  @IsString({ message: 'aprobadoPor debe ser texto' })
  @MaxLength(200, { message: 'aprobadoPor no puede superar 200 caracteres' })
  @Transform(trim)
  aprobadoPor?: string;
}

export class UpdateAsignacionBecaDto {
  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto' })
  motivo?: string;

  @IsOptional()
  @IsString({ message: 'aprobadoPor debe ser texto' })
  @MaxLength(200, { message: 'aprobadoPor no puede superar 200 caracteres' })
  @Transform(trim)
  aprobadoPor?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}
