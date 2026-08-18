import {
  IsString,
  IsIn,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMensajeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  titulo: string;

  @IsString()
  @MinLength(1)
  cuerpo: string;

  @IsIn(['aviso', 'novedad'])
  tipo: 'aviso' | 'novedad';

  @IsIn(['todas', 'lista', 'plan'])
  destinatario: 'todas' | 'lista' | 'plan';

  /** Requerido cuando destinatario='lista' */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  destinatarioIds?: number[];

  /**
   * Requerido cuando destinatario='plan'.
   * Valores activos: emprendedor | pyme | pro | plus
   */
  @IsOptional()
  @IsIn(['emprendedor', 'pyme', 'pro', 'plus'])
  destinatarioPlan?: string;

  /** ISO 8601 — puede ser futura para programar la publicación */
  @IsDateString()
  fechaPublicacion: string;

  @IsOptional()
  @IsDateString()
  fechaExpiracion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
