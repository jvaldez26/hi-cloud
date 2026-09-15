import {
  IsDefined, IsOptional, IsString, IsBoolean, IsInt, IsIn, IsDateString, MaxLength, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// El estado ESCRITO en ed_biblioteca_prestamos.estado es solo 'prestado' o
// 'devuelto' — 'vencido' nunca se guarda, se deriva al leer comparando
// fechaVencimiento contra fechaHoyRD() (ver BibliotecaService). Estos son
// los valores que puede llevar el FILTRO de la pantalla, no la columna.
export const ESTADOS_PRESTAMO_FILTRO = ['prestado', 'devuelto', 'vencido'] as const;

// ── Libros ───────────────────────────────────────────────────────────────────

export class CreateLibroDto {
  @IsOptional()
  @IsString({ message: 'El código debe ser texto' })
  @MaxLength(50, { message: 'El código no puede superar 50 caracteres' })
  @Transform(trim)
  codigo?: string;

  @IsOptional()
  @IsString({ message: 'El ISBN debe ser texto' })
  @MaxLength(50, { message: 'El ISBN no puede superar 50 caracteres' })
  @Transform(trim)
  isbn?: string;

  @IsDefined({ message: 'El título es requerido' })
  @IsString({ message: 'El título debe ser texto' })
  @MaxLength(300, { message: 'El título no puede superar 300 caracteres' })
  @Transform(trim)
  titulo: string;

  @IsOptional()
  @IsString({ message: 'El autor debe ser texto' })
  @MaxLength(200, { message: 'El autor no puede superar 200 caracteres' })
  @Transform(trim)
  autor?: string;

  @IsOptional()
  @IsString({ message: 'La editorial debe ser texto' })
  @MaxLength(150, { message: 'La editorial no puede superar 150 caracteres' })
  @Transform(trim)
  editorial?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser texto' })
  @MaxLength(100, { message: 'La categoría no puede superar 100 caracteres' })
  @Transform(trim)
  categoria?: string;

  @IsDefined({ message: 'La cantidad de ejemplares es requerida' })
  @IsInt({ message: 'La cantidad de ejemplares debe ser un número entero' })
  @Min(1, { message: 'Debe haber al menos 1 ejemplar' })
  cantidadTotal: number;

  @IsOptional()
  @IsString({ message: 'La ubicación debe ser texto' })
  @MaxLength(100, { message: 'La ubicación no puede superar 100 caracteres' })
  @Transform(trim)
  ubicacion?: string;
}

export class UpdateLibroDto {
  @IsOptional()
  @IsString({ message: 'El código debe ser texto' })
  @MaxLength(50, { message: 'El código no puede superar 50 caracteres' })
  @Transform(trim)
  codigo?: string;

  @IsOptional()
  @IsString({ message: 'El ISBN debe ser texto' })
  @MaxLength(50, { message: 'El ISBN no puede superar 50 caracteres' })
  @Transform(trim)
  isbn?: string;

  @IsOptional()
  @IsString({ message: 'El título debe ser texto' })
  @MaxLength(300, { message: 'El título no puede superar 300 caracteres' })
  @Transform(trim)
  titulo?: string;

  @IsOptional()
  @IsString({ message: 'El autor debe ser texto' })
  @MaxLength(200, { message: 'El autor no puede superar 200 caracteres' })
  @Transform(trim)
  autor?: string;

  @IsOptional()
  @IsString({ message: 'La editorial debe ser texto' })
  @MaxLength(150, { message: 'La editorial no puede superar 150 caracteres' })
  @Transform(trim)
  editorial?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser texto' })
  @MaxLength(100, { message: 'La categoría no puede superar 100 caracteres' })
  @Transform(trim)
  categoria?: string;

  // Si cambia, BibliotecaService ajusta cantidadDisponible por la
  // diferencia (nunca la pisa) — ver updateLibro().
  @IsOptional()
  @IsInt({ message: 'La cantidad de ejemplares debe ser un número entero' })
  @Min(0, { message: 'La cantidad de ejemplares no puede ser negativa' })
  cantidadTotal?: number;

  @IsOptional()
  @IsString({ message: 'La ubicación debe ser texto' })
  @MaxLength(100, { message: 'La ubicación no puede superar 100 caracteres' })
  @Transform(trim)
  ubicacion?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}

// ── Préstamos ────────────────────────────────────────────────────────────────

export class CreatePrestamoDto {
  @IsDefined({ message: 'El libro es requerido' })
  @IsInt({ message: 'El libro debe ser un identificador numérico' })
  libroId: number;

  // Exactamente uno de los dos — se valida en el service (BibliotecaService.
  // prestar()), no aquí: es una regla entre dos campos, no de uno solo.
  @IsOptional()
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId?: number;

  @IsOptional()
  @IsInt({ message: 'El docente debe ser un identificador numérico' })
  docenteId?: number;

  @IsDefined({ message: 'La fecha de vencimiento del préstamo es requerida' })
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser válida (YYYY-MM-DD)' })
  fechaVencimiento: string;
}

export class FiltrosPrestamoDto {
  @IsOptional()
  @IsInt({ message: 'El libro debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  libroId?: number;

  @IsOptional()
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  estudianteId?: number;

  @IsOptional()
  @IsInt({ message: 'El docente debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  docenteId?: number;

  @IsOptional()
  @IsIn(ESTADOS_PRESTAMO_FILTRO, { message: 'El estado debe ser "prestado", "devuelto" o "vencido"' })
  estado?: string;
}
