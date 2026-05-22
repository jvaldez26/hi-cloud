import {
  IsEnum, IsOptional, IsDateString,
  IsInt, IsPositive, IsBoolean, IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AccionAuditoria } from '../entities/audit-log.entity';

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
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  exitoso?: boolean;

  // search heredado de PaginationDto — usado para búsqueda en descripcion/userName/modulo/ruta
}
