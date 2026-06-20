import {
  IsEnum, IsOptional, IsDateString,
  IsInt, IsPositive, IsBoolean, IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AccionAuditoria, NivelAuditoria } from '../entities/audit-log.entity';

export class FiltroAuditoriaDto extends PaginationDto {
  @IsOptional() @IsEnum(AccionAuditoria)
  accion?: AccionAuditoria;

  @IsOptional() @IsString()
  modulo?: string;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  userId?: number;

  @IsOptional() @IsDateString()
  fechaDesde?: string;

  @IsOptional() @IsDateString()
  fechaHasta?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false' || value === false) return false;
    if (value === 'true'  || value === true)  return true;
    return undefined;
  })
  @IsBoolean()
  exitoso?: boolean;

  /** Nivel único: CRITICO | IMPORTANTE | NORMAL */
  @IsOptional() @IsEnum(NivelAuditoria)
  nivel?: NivelAuditoria;

  /**
   * Niveles múltiples separados por coma: "CRITICO,IMPORTANTE"
   * El frontend puede pasar este param para filtrar por varios niveles a la vez.
   */
  @IsOptional() @IsString()
  niveles?: string;

  // search heredado de PaginationDto — búsqueda en descripcion/userName/modulo/ruta
}
