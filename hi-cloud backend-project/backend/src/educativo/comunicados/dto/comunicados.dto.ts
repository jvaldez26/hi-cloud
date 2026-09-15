import {
  IsDefined, IsOptional, IsString, IsBoolean, IsInt, IsIn, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const DESTINATARIO_TIPOS = ['todos', 'grado', 'seccion', 'individual'] as const;

export class CreateComunicadoDto {
  @IsDefined({ message: 'El título es requerido' })
  @IsString({ message: 'El título debe ser texto' })
  @MaxLength(300, { message: 'El título no puede superar 300 caracteres' })
  @Transform(trim)
  titulo: string;

  @IsDefined({ message: 'El contenido es requerido' })
  @IsString({ message: 'El contenido debe ser texto' })
  contenido: string;

  @IsOptional()
  @IsString({ message: 'El tipo debe ser texto' })
  @MaxLength(30, { message: 'El tipo no puede superar 30 caracteres' })
  @Transform(trim)
  tipo?: string;

  @IsDefined({ message: 'El destinatario es requerido' })
  @IsIn(DESTINATARIO_TIPOS, { message: 'El destinatario debe ser "todos", "grado", "seccion" o "individual"' })
  destinatarioTipo: string;

  // Exactamente uno de estos tres, según destinatarioTipo — se valida en
  // el service (regla entre campos, no de uno solo).
  @IsOptional()
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  gradoId?: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId?: number;

  @IsOptional()
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId?: number;

  // Se guardan, pero NO disparan ningún envío todavía — ver
  // ComunicadosService. El envío real (WhatsApp/email) queda fuera de esta
  // tanda a propósito.
  @IsOptional()
  @IsBoolean({ message: 'enviarWhatsapp debe ser verdadero o falso' })
  enviarWhatsapp?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'enviarEmail debe ser verdadero o falso' })
  enviarEmail?: boolean;
}

export class UpdateComunicadoDto {
  @IsOptional()
  @IsString({ message: 'El título debe ser texto' })
  @MaxLength(300, { message: 'El título no puede superar 300 caracteres' })
  @Transform(trim)
  titulo?: string;

  @IsOptional()
  @IsString({ message: 'El contenido debe ser texto' })
  contenido?: string;

  @IsOptional()
  @IsString({ message: 'El tipo debe ser texto' })
  @MaxLength(30, { message: 'El tipo no puede superar 30 caracteres' })
  @Transform(trim)
  tipo?: string;

  @IsOptional()
  @IsIn(DESTINATARIO_TIPOS, { message: 'El destinatario debe ser "todos", "grado", "seccion" o "individual"' })
  destinatarioTipo?: string;

  @IsOptional()
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  gradoId?: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId?: number;

  @IsOptional()
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId?: number;

  @IsOptional()
  @IsBoolean({ message: 'enviarWhatsapp debe ser verdadero o falso' })
  enviarWhatsapp?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'enviarEmail debe ser verdadero o falso' })
  enviarEmail?: boolean;
}

export class FiltrosComunicadoDto {
  @IsOptional()
  @IsIn(DESTINATARIO_TIPOS, { message: 'El destinatario debe ser "todos", "grado", "seccion" o "individual"' })
  destinatarioTipo?: string;

  @IsOptional()
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  gradoId?: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  seccionId?: number;
}
