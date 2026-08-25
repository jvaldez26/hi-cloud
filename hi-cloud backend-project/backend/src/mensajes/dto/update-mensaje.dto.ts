import { IsString, IsOptional, IsBoolean, IsDateString, MinLength, MaxLength, IsIn, IsArray, IsInt } from 'class-validator';

/**
 * Permite editar un mensaje publicado (no solo los programados).
 * Un aviso con errata debe poder corregirse; editadoEn queda registrado.
 */
export class UpdateMensajeDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  titulo?: string;

  /** Editar cuerpo de mensaje ya publicado — se registra editadoEn */
  @IsOptional()
  @IsString()
  @MinLength(1)
  cuerpo?: string;

  /**
   * El tipo puede corregirse después de publicar —
   * un aviso mal clasificado como novedad (o viceversa) debe poder enmendarse.
   * El servicio lo escribe y marca editadoEn: ver adminEditar().
   */
  @IsOptional()
  @IsIn(['aviso', 'novedad'])
  tipo?: 'aviso' | 'novedad';

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsDateString()
  fechaPublicacion?: string;

  @IsOptional()
  @IsDateString()
  fechaExpiracion?: string;

  @IsOptional()
  @IsIn(['todas', 'lista', 'plan'])
  destinatario?: 'todas' | 'lista' | 'plan';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  destinatarioIds?: number[];

  @IsOptional()
  @IsIn(['emprendedor', 'pyme', 'pro', 'plus'])
  destinatarioPlan?: string;
}
