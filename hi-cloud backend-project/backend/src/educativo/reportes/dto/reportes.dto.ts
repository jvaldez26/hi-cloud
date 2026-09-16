import { IsOptional, IsInt, IsDateString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

const toInt = ({ value }: { value: unknown }) => (value !== undefined && value !== '' ? Number(value) : undefined);

/**
 * Filtros comunes a los 14 reportes de educativo. Todos opcionales — cada
 * endpoint usa el subconjunto que le aplica (ver reportes.service.ts) y por
 * defecto cae sobre el año escolar activo (esActual = true), nunca sobre
 * "todo el histórico" en silencio.
 */
export class FiltrosReporteDto {
  @IsOptional()
  @IsInt({ message: 'El año escolar debe ser un identificador numérico' })
  @Transform(toInt)
  anioEscolarId?: number;

  @IsOptional()
  @IsInt({ message: 'El grado debe ser un identificador numérico' })
  @Transform(toInt)
  gradoId?: number;

  @IsOptional()
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  @Transform(toInt)
  seccionId?: number;

  @IsOptional()
  @IsInt({ message: 'El período debe ser un identificador numérico' })
  @Transform(toInt)
  periodoId?: number;

  @IsOptional()
  @IsDateString({}, { message: '"desde" debe ser una fecha válida (YYYY-MM-DD)' })
  desde?: string;

  @IsOptional()
  @IsDateString({}, { message: '"hasta" debe ser una fecha válida (YYYY-MM-DD)' })
  hasta?: string;

  @IsOptional()
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor que cero' })
  @Transform(toInt)
  limite?: number;

  @IsOptional()
  @IsInt({ message: 'El umbral debe ser un número entero' })
  @Min(0, { message: 'El umbral no puede ser negativo' })
  @Transform(toInt)
  umbral?: number;
}
