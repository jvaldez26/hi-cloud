import {
  IsDefined, IsOptional, IsString, IsBoolean, IsInt, IsNumber, IsArray, MaxLength, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ── Rutas ────────────────────────────────────────────────────────────────────

export class CreateRutaDto {
  @IsDefined({ message: 'El nombre de la ruta es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  @Transform(trim)
  nombre: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  descripcion?: string;

  @IsOptional()
  @IsString({ message: 'El chofer debe ser texto' })
  @MaxLength(200, { message: 'El chofer no puede superar 200 caracteres' })
  @Transform(trim)
  chofer?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono del chofer debe ser texto' })
  @MaxLength(20, { message: 'El teléfono no puede superar 20 caracteres' })
  @Transform(trim)
  choferTelefono?: string;

  @IsOptional()
  @IsString({ message: 'La placa del vehículo debe ser texto' })
  @MaxLength(20, { message: 'La placa no puede superar 20 caracteres' })
  @Transform(trim)
  vehiculoPlaca?: string;

  @IsOptional()
  @IsInt({ message: 'La capacidad debe ser un número entero' })
  @Min(1, { message: 'La capacidad debe ser al menos 1' })
  capacidad?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El costo mensual debe ser un número' })
  @Min(0, { message: 'El costo mensual no puede ser negativo' })
  costoMensual?: number;

  @IsOptional()
  @IsArray({ message: 'Las paradas deben ser una lista de textos' })
  @IsString({ each: true, message: 'Cada parada debe ser texto' })
  paradas?: string[];
}

export class UpdateRutaDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  @Transform(trim)
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  descripcion?: string;

  @IsOptional()
  @IsString({ message: 'El chofer debe ser texto' })
  @MaxLength(200, { message: 'El chofer no puede superar 200 caracteres' })
  @Transform(trim)
  chofer?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono del chofer debe ser texto' })
  @MaxLength(20, { message: 'El teléfono no puede superar 20 caracteres' })
  @Transform(trim)
  choferTelefono?: string;

  @IsOptional()
  @IsString({ message: 'La placa del vehículo debe ser texto' })
  @MaxLength(20, { message: 'La placa no puede superar 20 caracteres' })
  @Transform(trim)
  vehiculoPlaca?: string;

  @IsOptional()
  @IsInt({ message: 'La capacidad debe ser un número entero' })
  @Min(1, { message: 'La capacidad debe ser al menos 1' })
  capacidad?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El costo mensual debe ser un número' })
  @Min(0, { message: 'El costo mensual no puede ser negativo' })
  costoMensual?: number;

  @IsOptional()
  @IsArray({ message: 'Las paradas deben ser una lista de textos' })
  @IsString({ each: true, message: 'Cada parada debe ser texto' })
  paradas?: string[];

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}

// ── Asignación de estudiantes a rutas ────────────────────────────────────────

export class AsignarEstudianteRutaDto {
  @IsDefined({ message: 'La ruta es requerida' })
  @IsInt({ message: 'La ruta debe ser un identificador numérico' })
  rutaId: number;

  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsOptional()
  @IsString({ message: 'La parada de recogida debe ser texto' })
  @MaxLength(200, { message: 'La parada no puede superar 200 caracteres' })
  @Transform(trim)
  paradaRecogida?: string;

  // Si se omite, se usa el costoMensual de la ruta.
  @IsOptional()
  @IsNumber({}, { message: 'El costo mensual debe ser un número' })
  @Min(0, { message: 'El costo mensual no puede ser negativo' })
  costoMensual?: number;
}

export class FiltrosAsignacionDto {
  @IsOptional()
  @IsInt({ message: 'La ruta debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  rutaId?: number;

  @IsOptional()
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  estudianteId?: number;
}
